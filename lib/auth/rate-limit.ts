/**
 * Simple in-memory token-bucket rate limiter.
 *
 * LIMITATION: this state lives in the Node process's memory. On serverless
 * platforms (Vercel functions), each cold-started instance gets its own
 * bucket and instances are not shared or guaranteed to be reused between
 * requests, so this provides best-effort throttling on a single warm
 * instance rather than a hard, globally-enforced limit. It is sufficient to
 * blunt casual abuse of onboarding/credential endpoints, but a production
 * deployment that needs a real guarantee should back this with a shared
 * store (Convex, Redis, Upstash) instead.
 */

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Consume one token from the named bucket. Returns whether the request is
 * allowed under the configured limit.
 */
export function rateLimit(
  key: string,
  options: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  const refillRate = options.limit / options.windowMs;
  const existing = buckets.get(key);

  if (!existing) {
    buckets.set(key, { tokens: options.limit - 1, updatedAt: now });
    return { allowed: true, remaining: options.limit - 1, resetAt: now + options.windowMs };
  }

  const elapsed = now - existing.updatedAt;
  const refilled = Math.min(options.limit, existing.tokens + elapsed * refillRate);

  if (refilled < 1) {
    buckets.set(key, { tokens: refilled, updatedAt: now });
    return {
      allowed: false,
      remaining: 0,
      resetAt: now + (1 - refilled) / refillRate,
    };
  }

  buckets.set(key, { tokens: refilled - 1, updatedAt: now });
  return { allowed: true, remaining: Math.floor(refilled - 1), resetAt: now + options.windowMs };
}

/** Reset all buckets — intended for tests only. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}
