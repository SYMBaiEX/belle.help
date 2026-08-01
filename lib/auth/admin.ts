import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Admin operator authentication for /admin. Distinct from lib/auth/session.ts
 * (Belle's phone-possession session for end users) — admins authenticate
 * with an email + password stored in convex/adminUsers.ts, hashed here with
 * Node's scrypt (never in Convex, which has no Node crypto).
 *
 * The signed cookie mirrors lib/auth/session.ts exactly: base64url(JSON
 * payload) + "." + base64url(HMAC-SHA256 signature) keyed by
 * APP_ENCRYPTION_KEY, but with a 12-hour expiry and a `kind: "admin"`
 * marker so an admin cookie can never be mistaken for (or forged from) a
 * regular user session cookie, and vice versa.
 */

export const ADMIN_COOKIE = "belle_admin";
const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours

interface AdminSessionPayload {
  kind: "admin";
  email: string;
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

/** Hash a plaintext password with a random salt (scrypt, 64-byte derived key). */
export function hashPassword(plain: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 64).toString("hex");
  return { hash, salt };
}

/** Constant-time verification of a plaintext password against a stored hash+salt. */
export function verifyPassword(plain: string, hash: string, salt: string): boolean {
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(plain, salt, 64);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Build a signed 12-hour admin session cookie value. Pure — no I/O. */
export function createAdminCookie(email: string): string {
  const now = Date.now();
  const payload: AdminSessionPayload = {
    kind: "admin",
    email: email.toLowerCase(),
    iat: now,
    exp: now + ADMIN_SESSION_MS,
  };
  const payloadBuffer = Buffer.from(JSON.stringify(payload), "utf8");
  const payloadPart = base64url(payloadBuffer);
  const signaturePart = base64url(sign(payloadBuffer));
  return `${payloadPart}.${signaturePart}`;
}

/** Verify and decode an admin session cookie value. Pure — no I/O. */
export function verifyAdminCookie(value: string | undefined | null): { email: string } | null {
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

  let payload: AdminSessionPayload;
  try {
    payload = JSON.parse(payloadBuffer.toString("utf8"));
  } catch {
    return null;
  }

  if (
    payload.kind !== "admin" ||
    typeof payload.email !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }

  if (payload.exp < Date.now()) return null;

  return { email: payload.email };
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ADMIN_SESSION_MS / 1000,
  };
}

/** Read the current admin session from cookies(). Null when absent/invalid. */
export async function getAdminEmail(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(ADMIN_COOKIE)?.value;
  const session = verifyAdminCookie(value);
  return session?.email ?? null;
}

/** Require a valid admin session, redirecting to /admin/login when absent. */
export async function requireAdmin(): Promise<{ email: string }> {
  const email = await getAdminEmail();
  if (!email) {
    redirect("/admin/login");
  }
  return { email };
}

const WEAK_PASSWORDS = new Set([
  "password",
  "password123",
  "changeme",
  "changeme123",
  "admin1234",
  "administrator",
  "letmein123",
  "qwertyuiop",
  "12345678901",
  "belle12345",
]);

/**
 * Returns an error message when `plain` is unacceptable as a NEW password
 * (change-password path only — never applied to the seeded initial
 * password, which an operator sets deliberately via env vars).
 */
export function passwordPolicy(plain: string): string | null {
  if (plain.length < 12) {
    return "Password must be at least 12 characters.";
  }
  if (WEAK_PASSWORDS.has(plain.toLowerCase())) {
    return "That password is too common. Choose something harder to guess.";
  }
  return null;
}
