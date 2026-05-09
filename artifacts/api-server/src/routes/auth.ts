import { Router } from "express";
import { db, usersTable, workersTable } from "@workspace/db";
import { eq, and, ne, or } from "drizzle-orm";
import { signToken, hashPassword, comparePassword, authenticate, setAuthCookie } from "../lib/auth";
import { sendPasswordResetEmail, sendWelcomeEmail, sendVerificationEmail } from "../lib/email";
import { serializeAuthUser } from "../lib/serialize-user";
import { logger } from "../lib/logger";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genReferralCode(name: string, id: number): string {
  const base = name.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 3).padEnd(3, "X");
  let suffix = "";
  let n = id + Date.now();
  for (let i = 0; i < 4; i++) { suffix += CHARS[n % CHARS.length]; n = Math.floor(n / CHARS.length) + Math.floor(Math.random() * 100); }
  return `${base}${suffix}`;
}

const router = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const { name, email: rawEmail, password, phone, role, referralCode: usedCode, state, city } = req.body;
  if (!name || !rawEmail || !password || !role) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  if (!["client", "worker", "cohost", "seller"].includes(role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }

  // Normalize email — login is case-insensitive, so registration must match
  const email = String(rawEmail).toLowerCase().trim();

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already in use" });
    return;
  }

  let referredBy: string | null = null;
  let referralBonus = 0;
  if (usedCode) {
    const [referrer] = await db.select().from(usersTable).where(eq(usersTable.referralCode, usedCode.toUpperCase()));
    if (referrer) {
      referredBy = usedCode.toUpperCase();
      referralBonus = 2;
      await db.update(usersTable).set({
        referralCount: (referrer.referralCount ?? 0) + 1,
        referralBonus: (referrer.referralBonus ?? 0) + 5,
      }).where(eq(usersTable.id, referrer.id));
    }
  }

  const passwordHash = await hashPassword(password);

  // Generate email verification token (raw → email link, sha256 hash → DB).
  // Mirrors the password-reset pattern. 24h validity, single-use.
  const rawVerifyToken    = crypto.randomBytes(32).toString("hex");
  const hashedVerifyToken = crypto.createHash("sha256").update(rawVerifyToken).digest("hex");
  const verifyExpiry      = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [user] = await db.insert(usersTable).values({
    name, email, passwordHash, phone: phone ?? null, role,
    referredBy, referralBonus,
    state: state ?? null,
    city: city ?? null,
    emailVerified: false,
    emailVerificationToken: hashedVerifyToken,
    emailVerificationExpiry: verifyExpiry,
  }).returning();

  const referralCode = genReferralCode(name, user.id);
  await db.update(usersTable).set({ referralCode }).where(eq(usersTable.id, user.id));

  if (role === "worker") {
    await db.insert(workersTable).values({ userId: user.id, categoryId: null as unknown as number });
  }

  // Send the verification email. The frontend page /verify-email reads the
  // token from the URL and calls GET /api/auth/verify-email behind the scenes.
  const appUrl    = process.env.APP_URL ?? "https://linkservi.com";
  const verifyUrl = `${appUrl}/verify-email?token=${rawVerifyToken}`;
  sendVerificationEmail(user.email, user.name, verifyUrl).catch(err =>
    logger.warn({ err, userId: user.id }, "Verification email failed (non-blocking)"),
  );

  // Send welcome email (fire-and-forget — never blocks the response)
  sendWelcomeEmail(user.email, user.name, role).catch(err =>
    logger.warn({ err, userId: user.id }, "Welcome email failed (non-blocking)"),
  );

  const token = signToken(user.id, user.role, (user as any).secondaryRole ?? null);
  setAuthCookie(res, token);
  res.status(201).json({
    user: serializeAuthUser(user),
    token,
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const { email: rawEmail, password } = req.body;
  if (!rawEmail || !password) {
    res.status(400).json({ error: "Correo y contraseña son requeridos" });
    return;
  }

  // Normalize email — search is case-insensitive (users may type mixed case)
  const email = rawEmail.toLowerCase().trim();

  let user;
  try {
    [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  } catch (err: any) {
    const message = String(err?.message ?? err);
    if (message.includes('relation "users" does not exist')) {
      res.status(503).json({ error: "La base de datos aún no está lista. Intenta de nuevo en unos minutos." });
      return;
    }
    res.status(503).json({ error: "La base de datos no está disponible. Intenta de nuevo en unos minutos." });
    return;
  }
  if (!user || !user.isActive) {
    res.status(401).json({ error: "Correo o contraseña incorrectos" });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Correo o contraseña incorrectos" });
    return;
  }

  const token = signToken(user.id, user.role, (user as any).secondaryRole ?? null);
  setAuthCookie(res, token);
  res.json({
    user: serializeAuthUser(user),
    token,
  });
});

router.post("/auth/logout", (_req, res): void => {
  res.clearCookie("sl_token", { path: "/" });
  res.json({ message: "Logged out" });
});

// ── Email verification ────────────────────────────────────────────────────────
// Single-use token, 24h expiry. The frontend page /verify-email reads the
// raw token from the URL and calls this endpoint, then renders success/error.
router.get("/auth/verify-email", async (req, res): Promise<void> => {
  const rawToken = String((req.query.token ?? "") as string).trim();
  if (!rawToken || rawToken.length < 32) {
    res.status(400).json({ error: "Token inválido" });
    return;
  }

  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.emailVerificationToken, hashedToken));

  if (!user) {
    res.status(400).json({ error: "Token inválido o ya utilizado" });
    return;
  }

  if (user.emailVerified) {
    // Idempotent: if already verified, treat as success and clear stale token.
    if (user.emailVerificationToken) {
      await db
        .update(usersTable)
        .set({ emailVerificationToken: null, emailVerificationExpiry: null })
        .where(eq(usersTable.id, user.id));
    }
    res.json({ ok: true, alreadyVerified: true });
    return;
  }

  if (!user.emailVerificationExpiry || new Date(user.emailVerificationExpiry) < new Date()) {
    res.status(410).json({ error: "El enlace expiró. Solicita uno nuevo." });
    return;
  }

  await db
    .update(usersTable)
    .set({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiry: null,
    })
    .where(eq(usersTable.id, user.id));

  logger.info({ userId: user.id, email: user.email }, "Email verified");
  res.json({ ok: true, alreadyVerified: false });
});

// ── Forgot Password ───────────────────────────────────────────────────────────

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "El correo es requerido" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));

  // Always respond 200 to prevent email enumeration attacks
  if (!user || !user.isActive) {
    res.json({ message: "Si el correo existe, recibirás un enlace en breve." });
    return;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  await db
    .update(usersTable)
    .set({ passwordResetToken: hashedToken, passwordResetExpiry: expiry })
    .where(eq(usersTable.id, user.id));

  const appUrl = process.env.APP_URL ?? "https://linkservi.com";
  const resetLink = `${appUrl}/reset-password?token=${rawToken}`;

  logger.info({ userId: user.id, email: user.email }, "Password reset token generated — attempting email send");

  try {
    await sendPasswordResetEmail(user.email, user.name, resetLink);
    logger.info({ userId: user.id, email: user.email }, "Password reset email dispatched successfully");
  } catch (e: any) {
    // We log the full error but do NOT expose it to the client (prevents email enumeration).
    logger.error(
      { err: { message: e?.message, stack: e?.stack }, userId: user.id, email: user.email },
      "FAILED to send password reset email — check Resend API key and from_email domain"
    );
  }

  res.json({ message: "Si el correo existe, recibirás un enlace en breve." });
});

// ── Reset Password ────────────────────────────────────────────────────────────

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, password } = req.body;
  if (!token || !password) {
    res.status(400).json({ error: "Token y contraseña son requeridos" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    return;
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.passwordResetToken, hashedToken));

  if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
    res.status(400).json({ error: "El enlace de recuperación es inválido o ha expirado." });
    return;
  }

  const passwordHash = await hashPassword(password);

  await db
    .update(usersTable)
    .set({
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiry: null,
    })
    .where(eq(usersTable.id, user.id));

  res.json({ message: "Contraseña actualizada correctamente. Ya puedes iniciar sesión." });
});

// ── Validate reset token (for frontend to pre-check) ─────────────────────────

router.get("/auth/reset-password/validate", async (req, res): Promise<void> => {
  const token = req.query.token as string;
  if (!token) {
    res.status(400).json({ valid: false, error: "Token requerido" });
    return;
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  const [user] = await db
    .select({ id: usersTable.id, expiry: usersTable.passwordResetExpiry })
    .from(usersTable)
    .where(eq(usersTable.passwordResetToken, hashedToken));

  if (!user || !user.expiry || user.expiry < new Date()) {
    res.json({ valid: false });
    return;
  }

  res.json({ valid: true, expiresAt: user.expiry });
});

// ── Firebase Social Login ─────────────────────────────────────────────────────

interface FirebaseClaims {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  firebase?: { sign_in_provider?: string };
}

let _googleCertsCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getGoogleCerts(): Promise<Record<string, string>> {
  if (_googleCertsCache && Date.now() < _googleCertsCache.expiresAt) {
    return _googleCertsCache.certs;
  }
  const res = await fetch(
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com",
    { signal: AbortSignal.timeout(5000) }
  );
  const certs = await res.json() as Record<string, string>;
  const ccHeader = res.headers.get("cache-control") ?? "";
  const maxAgeMatch = ccHeader.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) * 1000 : 3_600_000;
  _googleCertsCache = { certs, expiresAt: Date.now() + maxAge };
  return certs;
}

async function verifyFirebaseToken(idToken: string): Promise<FirebaseClaims> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID not configured");

  const header = JSON.parse(
    Buffer.from(idToken.split(".")[0], "base64url").toString("utf8")
  ) as { kid: string; alg: string };

  const certs = await getGoogleCerts();
  const publicKey = certs[header.kid];
  if (!publicKey) throw new Error("Unknown Firebase key ID");

  const payload = jwt.verify(idToken, publicKey, {
    algorithms: ["RS256"],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  }) as FirebaseClaims;

  if (!payload.sub) throw new Error("Missing sub claim");
  return payload;
}

router.post("/auth/social-login", async (req, res): Promise<void> => {
  const { idToken, role } = req.body;
  if (!idToken) {
    res.status(400).json({ error: "ID token requerido" });
    return;
  }

  let claims: FirebaseClaims;
  try {
    claims = await verifyFirebaseToken(idToken);
  } catch (e: any) {
    res.status(401).json({ error: "Token de Firebase inválido: " + (e?.message ?? "unknown") });
    return;
  }

  const { sub: providerId, email, name, picture } = claims;
  if (!email) {
    res.status(400).json({ error: "El proveedor no proporcionó un correo electrónico" });
    return;
  }

  let existing;
  try {
    existing = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.providerId, providerId), eq(usersTable.email, email)));
  } catch (err: any) {
    const message = String(err?.message ?? err);
    if (message.includes('relation "users" does not exist')) {
      res.status(503).json({ error: "La base de datos aún no está lista. Intenta de nuevo en unos minutos." });
      return;
    }
    res.status(503).json({ error: "La base de datos no está disponible. Intenta de nuevo en unos minutos." });
    return;
  }

  let user = existing[0];

  if (!user) {
    // New user — require an explicit role choice from the frontend
    const safeRole = ["client", "worker"].includes(role) ? (role as "client" | "worker") : null;
    if (!safeRole) {
      // Tell the frontend to show the role picker; the idToken is still valid
      res.json({ needsRoleSelection: true });
      return;
    }

    const displayName = name ?? email.split("@")[0];
    const placeholderHash = await hashPassword(crypto.randomBytes(32).toString("hex"));
    let created;
    try {
      [created] = await db.insert(usersTable).values({
        name: displayName,
        email,
        passwordHash: placeholderHash,
        role: safeRole,
        avatarUrl: picture ?? null,
        provider: "google",
        providerId,
      }).returning();
    } catch (err: any) {
      const message = String(err?.message ?? err);
      if (message.includes('relation "users" does not exist')) {
        res.status(503).json({ error: "La base de datos aún no está lista. Intenta de nuevo en unos minutos." });
        return;
      }
      res.status(503).json({ error: "No se pudo crear el usuario con Google. Intenta de nuevo." });
      return;
    }
    const referralCode = genReferralCode(created.name, created.id);
    await db.update(usersTable).set({ referralCode }).where(eq(usersTable.id, created.id));
    if (safeRole === "worker") {
      await db.insert(workersTable).values({ userId: created.id, categoryId: null as unknown as number });
    }
    user = { ...created, referralCode };

    // Send welcome email for new Google-auth users (fire-and-forget)
    sendWelcomeEmail(created.email, created.name, safeRole).catch(err =>
      logger.warn({ err, userId: created.id }, "Welcome email (Google) failed (non-blocking)"),
    );
  } else if (!user.providerId) {
    await db.update(usersTable).set({ providerId, avatarUrl: user.avatarUrl ?? (picture ?? null) }).where(eq(usersTable.id, user.id));
  }

  if (!user.isActive) {
    res.status(403).json({ error: "Tu cuenta está suspendida" });
    return;
  }

  const token = signToken(user.id, user.role, (user as any).secondaryRole ?? null);
  setAuthCookie(res, token);
  res.json({
    user: serializeAuthUser(user),
    token,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/verify-email/resend — solicita reenvío del correo de
// verificación. Solo útil para usuarios autenticados cuyo emailVerified es
// false. No revela info sensible (mismo response si ya verificado).
// Rate-limit casero: solo permite reenviar si pasaron al menos 60 segundos
// desde el último token emitido (basado en emailVerificationExpiry).
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/verify-email/resend", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  const u = user as any;
  if (u.emailVerified) {
    res.json({ ok: true, alreadyVerified: true });
    return;
  }
  // Cooldown: el token actual expira a +24h. Si fue emitido hace <60s,
  // el nuevo expiry sería >23h59m → bloqueamos.
  const currentExpiryMs = u.emailVerificationExpiry ? new Date(u.emailVerificationExpiry).getTime() : 0;
  const issuedAtApprox = currentExpiryMs - 24 * 60 * 60 * 1000;
  const sinceIssuedSec = Math.floor((Date.now() - issuedAtApprox) / 1000);
  if (issuedAtApprox > 0 && sinceIssuedSec < 60) {
    res.status(429).json({
      error: `Espera ${60 - sinceIssuedSec} segundos antes de pedir otro enlace.`,
      retryAfter: 60 - sinceIssuedSec,
    });
    return;
  }

  const rawVerifyToken    = crypto.randomBytes(32).toString("hex");
  const hashedVerifyToken = crypto.createHash("sha256").update(rawVerifyToken).digest("hex");
  const verifyExpiry      = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.update(usersTable).set({
    emailVerificationToken: hashedVerifyToken,
    emailVerificationExpiry: verifyExpiry,
  }).where(eq(usersTable.id, user.id));

  const appUrl    = process.env.APP_URL ?? "https://linkservi.com";
  const verifyUrl = `${appUrl}/verify-email?token=${rawVerifyToken}`;
  sendVerificationEmail(user.email, user.name, verifyUrl).catch(err =>
    logger.warn({ err, userId: user.id }, "Verification resend email failed"),
  );

  logger.info({ userId: user.id }, "Email verification resent");
  res.json({ ok: true });
});

router.get("/auth/me", authenticate, (req, res): void => {
  res.json(serializeAuthUser(req.user!));
});

export default router;
