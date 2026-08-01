import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

/**
 * Server-side Convex client for the agent runtime.
 *
 * Uses `anyApi` (untyped function references) so the agent tree does not
 * depend on `convex/_generated` output at compile time. Function names are
 * centralized here; keep them in sync with the files under `convex/`.
 */

let client: ConvexHttpClient | null = null;

export function convex(): ConvexHttpClient {
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

/** Typed-ish facade over the Convex functions the agent uses. */
export const db = {
  query: (name: string, args: Record<string, unknown>) => {
    const [mod, fn] = name.split(":");
    return convex().query(anyApi[mod!]![fn!]!, args);
  },
  mutation: (name: string, args: Record<string, unknown>) => {
    const [mod, fn] = name.split(":");
    return convex().mutation(anyApi[mod!]![fn!]!, args);
  },
};

export async function recordAudit(event: {
  userId?: string;
  actor: "belle" | "user" | "system";
  action: string;
  repositoryFullName?: string;
  prNumber?: number;
  detail?: string;
  refs?: Record<string, unknown>;
}): Promise<void> {
  await db.mutation("audit:record", { ...event, createdAt: Date.now() });
}
