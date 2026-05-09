import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { getAuthHeader } from "@/lib/api";

const PASSKEY_KEY = "sl_passkey_registered";

/** Returns true if WebAuthn is available in this browser */
export function isBiometricAvailable(): boolean {
  return typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function";
}

/** Returns true if the user has previously registered a passkey on this device */
export function hasBiometricRegistered(): boolean {
  try { return localStorage.getItem(PASSKEY_KEY) === "1"; } catch { return false; }
}

/** Mark that a passkey has been registered on this device */
function setBiometricRegistered(val: boolean) {
  try {
    if (val) localStorage.setItem(PASSKEY_KEY, "1");
    else localStorage.removeItem(PASSKEY_KEY);
  } catch {}
}

/** Register biometric credential — must be called while user is authenticated */
export async function registerBiometric(): Promise<{ ok: boolean; error?: string }> {
  try {
    // 1. Get options from server
    const optRes = await fetch("/api/passkeys/register/options", {
      method: "POST",
      headers: { ...getAuthHeader() },
    });
    if (!optRes.ok) {
      const e = await optRes.json().catch(() => ({}));
      return { ok: false, error: e.error ?? "No se pudo iniciar el registro." };
    }
    const options = await optRes.json();

    // 2. Trigger browser biometric dialog
    const attestation = await startRegistration({ optionsJSON: options });

    // 3. Send attestation to server
    const verRes = await fetch("/api/passkeys/register/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify(attestation),
    });
    if (!verRes.ok) {
      const e = await verRes.json().catch(() => ({}));
      return { ok: false, error: e.error ?? "Error al verificar biometría." };
    }
    const result = await verRes.json();
    if (result.verified) {
      setBiometricRegistered(true);
      return { ok: true };
    }
    return { ok: false, error: "Verificación incompleta." };
  } catch (e: any) {
    if (e.name === "NotAllowedError") return { ok: false, error: "Permiso denegado o cancelado." };
    if (e.name === "InvalidStateError") return { ok: false, error: "Este dispositivo ya tiene una llave registrada." };
    return { ok: false, error: e.message ?? "Error inesperado." };
  }
}

/** Authenticate with biometric — returns { user, token } or throws */
export async function authenticateBiometric(): Promise<{ user: any; token: string }> {
  // 1. Get auth options
  const optRes = await fetch("/api/passkeys/auth/options", { method: "POST" });
  if (!optRes.ok) throw new Error("No se pudo iniciar la autenticación biométrica.");
  const options = await optRes.json();

  // 2. Trigger browser biometric
  const assertion = await startAuthentication({ optionsJSON: options });

  // 3. Verify on server
  const verRes = await fetch("/api/passkeys/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(assertion),
  });
  if (!verRes.ok) {
    const e = await verRes.json().catch(() => ({}));
    throw new Error(e.error ?? "Autenticación biométrica fallida.");
  }
  return verRes.json();
}

/** Fetch all passkeys from server */
export async function listPasskeys(): Promise<{ id: number; deviceType: string; createdAt: string }[]> {
  const res = await fetch("/api/passkeys", { headers: getAuthHeader() });
  if (!res.ok) return [];
  return res.json();
}

/** Delete a passkey by id */
export async function deletePasskey(id: number): Promise<void> {
  await fetch(`/api/passkeys/${id}`, { method: "DELETE", headers: getAuthHeader() });
  // If no more passkeys, clear local hint
  const remaining = await listPasskeys();
  if (remaining.length === 0) setBiometricRegistered(false);
}
