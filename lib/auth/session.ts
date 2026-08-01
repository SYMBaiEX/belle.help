import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Stateless signed session cookie for Belle's web dashboard.
 *
 * Belle has no password auth: possession of the phone number that Belle
 * texts is the authentication factor. The onboarding link (delivered over
 * iMessage/RCS/SMS) is the sign-in mechanism. Once a user completes
 * onboarding, we mint this cookie so they stay signed in on the web without
 * re-verifying every request.
 *
 * Cookie value: base64url(JSON payload) + "." + base64url(HMAC-SHA256 of the
 * payload, keyed by APP_ENCRYPTION_KEY) — same construction style as
 * lib/security/onboarding-links.ts, reused here rather than re-exported
 * since the payload shape and TTL semantics differ.
 */

export const SESSION_COOKIE_NAME = "belle_session";
const DEFAULT_SESSION_DAYS = 30;

export interface SessionPayload {
  userId: string;
  iat: number;
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

/** Build a signed session cookie value for the given user. Pure — no I/O. */
export function createSessionCookie(
  userId: string,
  days: number = DEFAULT_SESSION_DAYS,
): string {
  const now = Date.now();
  const payload: SessionPayload = {
    userId,
    iat: now,
    exp: now + days * 24 * 60 * 60 * 1000,
  };
  const payloadBuffer = Buffer.from(JSON.stringify(payload), "utf8");
  const payloadPart = base64url(payloadBuffer);
  const signaturePart = base64url(sign(payloadBuffer));
  return `${payloadPart}.${signaturePart}`;
}

/** Verify and decode a session cookie value. Pure — no I/O. */
export function verifySessionCookie(
  value: string | undefined | null,
): { userId: string } | null {
  if (!value) return null;
  const parts = value.split(".");
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

  let payload: SessionPayload;
  try {
    payload = JSON.parse(payloadBuffer.toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof payload.userId !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }

  if (payload.exp < Date.now()) return null;

  return { userId: payload.userId };
}

export function sessionCookieOptions(days: number = DEFAULT_SESSION_DAYS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: days * 24 * 60 * 60,
  };
}

/**
 * Read the current session from cookies() in a server component or route
 * handler. Returns null when there is no valid session — callers that
 * require auth should use `requireSessionUser` instead.
 */
export async function getSessionUser(): Promise<{
  userId: Id<"users">;
} | null> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionCookie(value);
  if (!session) return null;
  return { userId: session.userId as Id<"users"> };
}

/**
 * Require a valid session in a server component, redirecting to /signin
 * when absent. Use at the top of dashboard pages/layouts.
 */
export async function requireSessionUser(): Promise<{
  userId: Id<"users">;
}> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/signin");
  }
  return user;
}
