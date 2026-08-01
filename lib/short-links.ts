import { randomBytes } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

/**
 * Short, brandable links for URLs Belle texts to users (e.g. the giant
 * signed onboarding token). Lives at repo-root `lib/` — not `agent/lib/` —
 * with zero Next.js imports, the same isolation constraint as
 * `lib/github-tenant.ts`: the Eve agent bundle must be able to import this
 * module directly, and a `next/*` import here has broken that build before.
 */

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const SHORT_LINK_TTL_MS = 30 * 60 * 1000;

export type ShortLinkKind = "onboarding" | "github_connect" | "dashboard";

/** Cryptographically random short code, drawn from an ambiguity-free alphabet. */
export function generateShortCode(length = 7): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return code;
}

let client: ConvexHttpClient | null = null;

function convex(): ConvexHttpClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` locally or configure the production deployment.",
    );
  }
  client = new ConvexHttpClient(url);
  return client;
}

const db = {
  mutation: (name: string, args: Record<string, unknown>) => {
    const [mod, fn] = name.split(":");
    return convex().mutation(anyApi[mod!]![fn!]!, args);
  },
};

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://belle.help";
}

const MAX_CREATE_ATTEMPTS = 3;

/**
 * Create a short link pointing at `target` and return its full URL
 * (`${NEXT_PUBLIC_APP_URL}/s/${code}`). Retries with a fresh code on
 * collision, up to `MAX_CREATE_ATTEMPTS` times.
 */
export async function createShortLink(
  target: string,
  kind: ShortLinkKind,
  opts?: { userId?: string; ttlMs?: number },
): Promise<string> {
  const expiresAt = Date.now() + (opts?.ttlMs ?? SHORT_LINK_TTL_MS);

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    const code = generateShortCode();
    try {
      await db.mutation("shortLinks:create", {
        code,
        target,
        kind,
        userId: opts?.userId,
        expiresAt,
      });
      return `${appBaseUrl()}/s/${code}`;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Failed to create a short link after ${MAX_CREATE_ATTEMPTS} attempts: ${String(lastError)}`,
  );
}
