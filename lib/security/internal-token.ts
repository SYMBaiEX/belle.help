import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Shared-secret auth for deployment-internal calls to Belle's own eve routes.
 *
 * The watchdog schedule has to POST `/eve/v1/session/:id/cancel` to unwedge a
 * session, and that route sits behind the eve channel's auth policy. The
 * schedule runs inside the deployment, but it is still an ordinary HTTP client
 * to that route, so it needs a credential.
 *
 * Vercel OIDC would work, but only when OIDC federation is enabled and a token
 * happens to be present in the function environment — a silent no-op for the
 * watchdog if it is not. A dedicated secret makes the trust boundary explicit
 * and the failure mode loud.
 *
 * Never a user-facing credential: it authenticates the deployment to itself.
 */
const MIN_TOKEN_LENGTH = 32;

export function internalToken(): string | null {
  const token = process.env.BELLE_INTERNAL_TOKEN;
  if (!token || token.length < MIN_TOKEN_LENGTH) return null;
  return token;
}

/**
 * Constant-time comparison of a presented bearer token against the configured
 * secret.
 *
 * Both sides are SHA-256'd first so `timingSafeEqual` always sees equal-length
 * buffers — it throws on a length mismatch, and an exception thrown only for
 * wrong-length input is itself a length oracle.
 */
export function verifyInternalToken(presented: string | null | undefined): boolean {
  const expected = internalToken();
  if (!expected || !presented) return false;

  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Extract a bearer token from an `Authorization` header value. */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
