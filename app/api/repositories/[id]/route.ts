import { NextRequest } from "next/server";
import { z } from "zod";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getSessionUser } from "@/lib/auth/session";
import { apiError, apiOk } from "@/lib/api/respond";

const bodySchema = z.object({
  watchEnabled: z.boolean().optional(),
  watchExpiresAt: z.number().optional(),
  autonomyLevel: z.number().min(0).max(4).optional(),
  reviewPolicy: z
    .enum(["internal_only", "blocking_only", "blocking_important", "high_confidence", "always_ask"])
    .optional(),
  notifyDrafts: z.boolean().optional(),
  notifyCiFailures: z.boolean().optional(),
  autoReview: z.boolean().optional(),
  securityReview: z.boolean().optional(),
  dailyDigest: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  branchFilters: z.array(z.string()).optional(),
  authorFilters: z.array(z.string()).optional(),
  labelFilters: z.array(z.string()).optional(),
  quietHoursStart: z.number().min(0).max(23).optional(),
  quietHoursEnd: z.number().min(0).max(23).optional(),
});

async function authorizeRepo(userId: string, repositoryId: Id<"repositories">) {
  const repo = await fetchQuery(api.repositoriesExtra.getById, { repositoryId });
  if (!repo || repo.userId !== userId) return null;
  return repo;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return apiError(401, "Not signed in.", "unauthenticated");

  const { id } = await params;
  const repositoryId = id as Id<"repositories">;
  const repo = await authorizeRepo(session.userId, repositoryId);
  if (!repo) return apiError(404, "Repository not found.", "not_found");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "Invalid request.", "invalid_body");
  }
  const body = parsed.data;

  if (body.watchEnabled !== undefined) {
    await fetchMutation(api.repositories.setWatch, {
      repositoryId,
      watchEnabled: body.watchEnabled,
      watchExpiresAt: body.watchExpiresAt,
    });
  }
  if (body.autonomyLevel !== undefined) {
    await fetchMutation(api.repositories.setAutonomy, {
      repositoryId,
      autonomyLevel: body.autonomyLevel,
    });
  }
  if (body.reviewPolicy !== undefined) {
    await fetchMutation(api.repositoriesExtra.setReviewPolicy, {
      repositoryId,
      reviewPolicy: body.reviewPolicy,
    });
  }
  if (
    body.notifyDrafts !== undefined ||
    body.notifyCiFailures !== undefined ||
    body.autoReview !== undefined ||
    body.securityReview !== undefined ||
    body.dailyDigest !== undefined ||
    body.weeklyDigest !== undefined
  ) {
    await fetchMutation(api.repositoriesExtra.setNotifications, {
      repositoryId,
      notifyDrafts: body.notifyDrafts,
      notifyCiFailures: body.notifyCiFailures,
      autoReview: body.autoReview,
      securityReview: body.securityReview,
      dailyDigest: body.dailyDigest,
      weeklyDigest: body.weeklyDigest,
    });
  }
  if (
    body.branchFilters !== undefined ||
    body.authorFilters !== undefined ||
    body.labelFilters !== undefined
  ) {
    await fetchMutation(api.repositoriesExtra.setFilters, {
      repositoryId,
      branchFilters: body.branchFilters,
      authorFilters: body.authorFilters,
      labelFilters: body.labelFilters,
    });
  }
  if (body.quietHoursStart !== undefined || body.quietHoursEnd !== undefined) {
    await fetchMutation(api.repositoriesExtra.setQuietHours, {
      repositoryId,
      quietHoursStart: body.quietHoursStart,
      quietHoursEnd: body.quietHoursEnd,
    });
  }

  await fetchMutation(api.audit.record, {
    userId: session.userId,
    actor: "user",
    action: "repository.settings_updated",
    repositoryFullName: repo.fullName,
    refs: body,
  });

  const updated = await fetchQuery(api.repositoriesExtra.getById, { repositoryId });
  return apiOk({ repository: updated });
}
