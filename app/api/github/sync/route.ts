import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { getSessionUser } from "@/lib/auth/session";
import { apiError, apiOk } from "@/lib/api/respond";
import { rateLimit } from "@/lib/auth/rate-limit";
import { syncRepositoriesWorkflow } from "@/app/workflows/sync-repositories";

/**
 * Re-sync every active GitHub App installation the session user has, e.g.
 * after granting access to a new repository from GitHub's UI directly
 * (which doesn't round-trip through /api/github/callback).
 */
export async function POST() {
  const session = await getSessionUser();
  if (!session) return apiError(401, "Not signed in.", "unauthenticated");

  const limited = rateLimit(`github-sync:${session.userId}`, { limit: 10, windowMs: 60_000 });
  if (!limited.allowed) {
    return apiError(429, "Too many attempts. Try again in a moment.", "rate_limited");
  }

  const installations = await fetchQuery(api.githubInstallations.listByUser, {
    userId: session.userId,
  });

  let added = 0;
  let updated = 0;
  let total = 0;
  let synced = 0;

  for (const installation of installations) {
    if (installation.status !== "active") continue;
    try {
      // Durable: each GitHub page and each Convex write is a checkpointed,
      // independently retried step that outlives this request.
      const result = await syncRepositoriesWorkflow({
        userId: session.userId,
        installationId: installation.installationId,
      });
      added += result.added;
      updated += result.updated;
      total += result.total;
      synced += 1;
    } catch {
      // Skip installations we can't currently mint a token for (e.g. the
      // Vercel Connect connector isn't configured yet) — best-effort sync.
    }
  }

  await fetchMutation(api.audit.record, {
    userId: session.userId,
    actor: "user",
    action: "github.repositories_synced",
    detail: `Synced ${synced} installation(s): ${added} added, ${updated} updated, ${total} total.`,
  });

  return apiOk({ installations: synced, added, updated, total });
}
