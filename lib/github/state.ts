import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signed, short-lived OAuth `state` for the GitHub App install callback.
 *
 * The GitHub App install flow (GET /api/github/install -> GitHub ->
 * GET /api/github/callback) has no session cookie round-trip we can rely on
 * (GitHub, not us, controls the redirect), so we tie the callback back to a
 * Belle user via a signed `state` query parameter instead. Construction
 * mirrors lib/auth/admin.ts / lib/auth/session-token.ts exactly: base64url
 * (JSON payload) + "." + base64url(HMAC-SHA256 of the payload, keyed by
 * APP_ENCRYPTION_KEY). Never trust `installation_id` from the callback
 * without verifying this first.
 */

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface InstallStatePayload {
  userId: string;
  nonce: string;
  exp: number;
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
  return createHmac("sha256", loadSigningKey()).update(payload).digest();
}

/** Build a signed install-state value for the given user. Pure — no I/O. */
export function createInstallState(userId: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const payload: InstallStatePayload = {
    userId,
    nonce: base64url(randomBytes(16)),
    exp: Date.now() + ttlMs,
  };
  const payloadBuffer = Buffer.from(JSON.stringify(payload), "utf8");
  const payloadPart = base64url(payloadBuffer);
  const signaturePart = base64url(sign(payloadBuffer));
  return `${payloadPart}.${signaturePart}`;
}

/** Verify and decode an install-state value. Pure — no I/O. */
export function verifyInstallState(state: string | undefined | null): { userId: string } | null {
  if (!state) return null;
  const parts = state.split(".");
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

  let payload: InstallStatePayload;
  try {
    payload = JSON.parse(payloadBuffer.toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof payload.userId !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }

  if (payload.exp < Date.now()) return null;

  return { userId: payload.userId };
}
