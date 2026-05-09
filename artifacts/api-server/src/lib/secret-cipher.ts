import crypto from "node:crypto";
import { logger } from "./logger";

const PREFIX = "enc:v1:";
const ALG = "aes-256-gcm";

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  // Preferimos SECRET_ENCRYPTION_KEY (dedicada). SESSION_SECRET sirve como
  // fallback porque ya es un secreto fuerte en producción y permite rodar el
  // cifrado sin requerir un cambio de configuración inmediato. NO hay literal
  // hardcoded: si ambos faltan lanzamos error (fail-closed).
  const raw = process.env.SECRET_ENCRYPTION_KEY ?? process.env.SESSION_SECRET ?? "";
  if (!raw || raw.length < 16) {
    throw new Error("SECRET_ENCRYPTION_KEY (o SESSION_SECRET) requerido para cifrar/descifrar secretos");
  }
  cachedKey = crypto.createHash("sha256").update(raw).digest();
  return cachedKey;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  if (isEncrypted(plain)) return plain;
  // fail-closed: si el cifrado falla NUNCA devolvemos plaintext; lanzamos para
  // que el endpoint responda 500 y el secreto NO se persista en claro.
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, getKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${ct.toString("base64")}:${tag.toString("base64")}`;
}

export function decryptSecret(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (!isEncrypted(value)) return String(value);
  try {
    const parts = value.slice(PREFIX.length).split(":");
    if (parts.length !== 3) throw new Error("malformed cipher payload");
    const [ivB64, ctB64, tagB64] = parts;
    const iv = Buffer.from(ivB64, "base64");
    const ct = Buffer.from(ctB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const decipher = crypto.createDecipheriv(ALG, getKey(), iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } catch (err) {
    logger.warn({ err }, "decryptSecret failed — devolviendo null");
    return null;
  }
}
