import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

/**
 * AES-256-GCM secret encryption for user-supplied credentials (e.g. BYOK
 * OpenAI API keys). Keys never touch the database in plaintext.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
export const CURRENT_KEY_VERSION = 1;

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "APP_ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32` " +
        "and set it in your environment before using lib/encryption.",
    );
  }

  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      "APP_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). " +
        "Generate one with `openssl rand -hex 32`.",
    );
  }

  cachedKey = Buffer.from(raw, "hex");
  return cachedKey;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion: CURRENT_KEY_VERSION,
  };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const key = loadKey();
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

/**
 * Deterministic, non-reversible identifier for a phone number. Used to look
 * up phone identities without storing raw E.164 numbers as query keys.
 * This is an internal lookup hash, not a security boundary on its own —
 * callers should still treat the derived value as sensitive.
 */
export function hashPhone(e164: string): string {
  const key = loadKey();
  return createHmac("sha256", key).update(e164).digest("hex");
}

export function last4(e164: string): string {
  return e164.slice(-4);
}
