import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signed, short-lived onboarding tokens sent to a user over iMessage/SMS so
 * they can claim their phone-based Belle account on the web. The token is
 * a base64url payload plus a base64url HMAC-SHA256 signature, both derived
 * from APP_ENCRYPTION_KEY. Pure functions — no I/O, no Convex access — so
 * they're easy to unit test.
 */

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface OnboardingTokenPayload {
  linqChatId: string;
  phoneHash: string;
  nonce: string;
  iat: number;
  exp: number;
}

export interface CreatedOnboardingToken {
  token: string;
  tokenHash: string;
  expiresAt: number;
}

function loadSigningKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "APP_ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32`.",
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      "APP_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).",
    );
  }
  return Buffer.from(raw, "hex");
}

function base64url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlToBuffer(input: string): Buffer {
  const padded = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(input.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function sign(payload: Buffer): Buffer {
  const key = loadSigningKey();
  return createHmac("sha256", key).update(payload).digest();
}

export function createOnboardingToken(
  args: { linqChatId: string; phoneHash: string },
  ttlMs: number = DEFAULT_TTL_MS,
): CreatedOnboardingToken {
  const now = Date.now();
  const payload: OnboardingTokenPayload = {
    linqChatId: args.linqChatId,
    phoneHash: args.phoneHash,
    nonce: randomBytes(16).toString("hex"),
    iat: now,
    exp: now + ttlMs,
  };

  const payloadBuffer = Buffer.from(JSON.stringify(payload), "utf8");
  const payloadPart = base64url(payloadBuffer);
  const signaturePart = base64url(sign(payloadBuffer));
  const token = `${payloadPart}.${signaturePart}`;

  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: payload.exp,
  };
}

export function verifyOnboardingToken(
  token: string,
): OnboardingTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadPart, signaturePart] = parts;
  if (!payloadPart || !signaturePart) return null;

  let payloadBuffer: Buffer;
  let providedSignature: Buffer;
  try {
    payloadBuffer = base64urlToBuffer(payloadPart);
    providedSignature = base64urlToBuffer(signaturePart);
  } catch {
    return null;
  }

  let expectedSignature: Buffer;
  try {
    expectedSignature = sign(payloadBuffer);
  } catch {
    return null;
  }

  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return null;
  }

  let payload: OnboardingTokenPayload;
  try {
    payload = JSON.parse(payloadBuffer.toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof payload.linqChatId !== "string" ||
    typeof payload.phoneHash !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }

  if (payload.exp < Date.now()) {
    return null;
  }

  return payload;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
