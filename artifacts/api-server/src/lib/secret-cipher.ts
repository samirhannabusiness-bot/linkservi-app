import crypto from "node:crypto";
import { logger } from "./logger";

const PREFIX = "enc:v1:";
const ALG = "aes-256-gcm";

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.SECRET_ENCRYPTION_KEY ?? process.env.SESSION_SECRET ?? "";
  if (!raw) {
    logger.warn("SECRET_ENCRYPTION_KEY/SESSION_SECRET no configurados — usando llave derivada inestable");
  }
  cachedKey = crypto.createHash("sha256").update(raw || "linkservi-fallback-key-do-not-use-in-prod").digest();
  return cachedKey;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  if (isEncrypted(plain)) return plain;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALG, getKey(), iv);
    const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString("base64")}:${ct.toString("base64")}:${tag.toString("base64")}`;
  } catch (err) {
    logger.error({ err }, "encryptSecret failed — almacenando en plano (legacy fallback)");
    return String(plain);
  }
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
