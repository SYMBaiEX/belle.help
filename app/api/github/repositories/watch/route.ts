import { NextRequest } from "next/server";
import { z } from "zod";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { getSessionUser } from "@/lib/auth/session";
import { apiError, apiOk } from "@/lib/api/respond";

const bodySchema = z.object({
  fullName: z.string().min(1),
  watchEnabled: z.boolean(),
  autonomyLevel: z.number().min(0).max(4).optional(),
});

/**
 * Toggle watch (and optionally set autonomy) for one of the session user's
 * repositories, verifying ownership first — the model/client can never
 * watch a repo it doesn't already own in Convex.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return apiError(401, "Not signed in.", "unauthenticated");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "Invalid request.", "invalid_body");
  }
  const { fullName, watchEnabled, autonomyLevel } = parsed.data;

  const repo = await fetchQuery(api.repositories.getByUserAndFullName, {
    userId: session.userId,
    fullName,
  });
  if (!repo) return apiError(404, "Repository not found.", "not_found");

  await fetchMutation(api.repositories.updateConfig, {
    repositoryId: repo._id,
    watchEnabled,
    autonomyLevel,
  });

  await fetchMutation(api.audit.record, {
    userId: session.userId,
    actor: "user",
    action: "repository.watch_updated",
    repositoryFullName: fullName,
    detail: `watchEnabled=${watchEnabled}${autonomyLevel !== undefined ? `, autonomyLevel=${autonomyLevel}` : ""}`,
  });

  const updated = await fetchQuery(api.repositoriesExtra.getById, { repositoryId: repo._id });
  return apiOk({ repository: updated });
}
