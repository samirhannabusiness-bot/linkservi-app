import { Router } from "express";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { db, usersTable, passkeyCredentialsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, signToken, setAuthCookie } from "../lib/auth";
import { serializeAuthUser } from "../lib/serialize-user";

// ── In-memory challenge store (5-min TTL) ─────────────────────────────────────
const challenges = new Map<string, { value: string; exp: number }>();

function saveChallenge(key: string, challenge: string) {
  challenges.set(key, { value: challenge, exp: Date.now() + 5 * 60_000 });
}

function consumeChallenge(key: string): string | null {
  const entry = challenges.get(key);
  challenges.delete(key);
  if (!entry || entry.exp < Date.now()) return null;
  return entry.value;
}

function rpIDFromOrigin(origin?: string): string {
  try { return new URL(origin ?? "").hostname; } catch { return "localhost"; }
}

const router = Router();

// ── GET /api/passkeys — list user's registered passkeys ──────────────────────
router.get("/passkeys", authenticate, async (req: any, res): Promise<void> => {
  const rows = await db
    .select({ id: passkeyCredentialsTable.id, deviceType: passkeyCredentialsTable.deviceType, createdAt: passkeyCredentialsTable.createdAt })
    .from(passkeyCredentialsTable)
    .where(eq(passkeyCredentialsTable.userId, req.user.id));
  res.json(rows);
});

// ── DELETE /api/passkeys/:id — remove a passkey ──────────────────────────────
router.delete("/passkeys/:id", authenticate, async (req: any, res): Promise<void> => {
  await db
    .delete(passkeyCredentialsTable)
    .where(eq(passkeyCredentialsTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

// ── POST /api/passkeys/register/options ──────────────────────────────────────
router.post("/passkeys/register/options", authenticate, async (req: any, res): Promise<void> => {
  const user = req.user;
  const rpID = rpIDFromOrigin(req.headers.origin);

  const existing = await db
    .select({ credentialId: passkeyCredentialsTable.credentialId })
    .from(passkeyCredentialsTable)
    .where(eq(passkeyCredentialsTable.userId, user.id));

  // Use a stable userID derived from the DB user ID so the platform authenticator
  // (Android/iOS passkey manager) always shows the same account entry — not a
  // new one on every registration attempt.
  const userIDBuffer = new TextEncoder().encode(`sl-user-${user.id}`);

  const options = await generateRegistrationOptions({
    rpName: "LinkServi",
    rpID,
    userID: userIDBuffer,
    userName: user.email,
    userDisplayName: user.name,
    attestationType: "none",
    excludeCredentials: existing.map(c => ({ id: c.credentialId })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      authenticatorAttachment: "platform",
    },
  });

  saveChallenge(`reg:${user.id}`, options.challenge);
  res.json(options);
});

// ── POST /api/passkeys/register/verify ──────────────────────────────────────
router.post("/passkeys/register/verify", authenticate, async (req: any, res): Promise<void> => {
  const user = req.user;
  const origin = req.headers.origin ?? "";
  const rpID = rpIDFromOrigin(origin);
  const expectedChallenge = consumeChallenge(`reg:${user.id}`);

  if (!expectedChallenge) {
    res.status(400).json({ error: "Challenge expirado. Intenta de nuevo." });
    return;
  }

  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
    return;
  }

  if (!verification.verified || !verification.registrationInfo) {
    res.status(400).json({ error: "Verificación biométrica fallida." });
    return;
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  await db
    .insert(passkeyCredentialsTable)
    .values({
      userId: user.id,
      credentialId: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: (req.body.response?.transports ?? []) as string[],
    })
    .onConflictDoNothing();

  res.json({ verified: true });
});

// ── POST /api/passkeys/auth/options ─────────────────────────────────────────
router.post("/passkeys/auth/options", async (req, res): Promise<void> => {
  const rpID = rpIDFromOrigin(req.headers.origin);

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: [],
  });

  saveChallenge(`auth:${rpID}`, options.challenge);
  res.json(options);
});

// ── POST /api/passkeys/auth/verify ──────────────────────────────────────────
router.post("/passkeys/auth/verify", async (req, res): Promise<void> => {
  const origin = req.headers.origin ?? "";
  const rpID = rpIDFromOrigin(origin);
  const expectedChallenge = consumeChallenge(`auth:${rpID}`);

  if (!expectedChallenge) {
    res.status(400).json({ error: "Challenge expirado. Intenta de nuevo." });
    return;
  }

  const credentialId: string = req.body.id;
  const [cred] = await db
    .select()
    .from(passkeyCredentialsTable)
    .where(eq(passkeyCredentialsTable.credentialId, credentialId));

  if (!cred) {
    res.status(400).json({ error: "Credential no encontrada. Regístrala de nuevo." });
    return;
  }

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credentialId,
        publicKey: isoBase64URL.toBuffer(cred.publicKey),
        counter: cred.counter,
        transports: (cred.transports ?? []) as AuthenticatorTransport[],
      },
      requireUserVerification: false,
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
    return;
  }

  if (!verification.verified) {
    res.status(401).json({ error: "Autenticación biométrica fallida." });
    return;
  }

  // Update counter
  await db
    .update(passkeyCredentialsTable)
    .set({ counter: verification.authenticationInfo.newCounter })
    .where(eq(passkeyCredentialsTable.credentialId, credentialId));

  // Load user and issue JWT
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, cred.userId));

  if (!user || !user.isActive) {
    res.status(403).json({ error: "Cuenta inactiva." });
    return;
  }

  const token = signToken(user.id, user.role, (user as any).secondaryRole ?? null);
  setAuthCookie(res, token);
  res.json({
    user: serializeAuthUser(user),
    token,
  });
});

export default router;
