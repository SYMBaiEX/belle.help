import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "../lib/convex";
import { tenantCallerOrError } from "../lib/tenant";

export default defineTool({
  description:
    "Get a repository's Belle configuration (autonomy level, review policy, notification/watch filters) plus any repository-scoped memories Belle has recorded about it. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
  }),
  async execute({ repositoryFullName }, ctx) {
    const tenant = tenantCallerOrError(ctx);
    if (!tenant.ok) return tenant;
    const { caller } = tenant;

    const repo = (await db.query("repositories:getByUserAndFullName", {
      userId: caller.userId,
      fullName: repositoryFullName,
    })) as {
      fullName: string;
      owner: string;
      name: string;
      defaultBranch?: string;
      autonomyLevel: number;
      watchEnabled: boolean;
      watchExpiresAt?: number;
      reviewPolicy: string;
      notifyDrafts: boolean;
      notifyCiFailures: boolean;
      autoReview: boolean;
      securityReview: boolean;
      branchFilters?: string[];
      authorFilters?: string[];
      labelFilters?: string[];
      dailyDigest: boolean;
      weeklyDigest: boolean;
    } | null;

    if (!repo) {
      return {
        ok: false as const,
        reason: "repository_not_configured",
        message: `Repository ${repositoryFullName} is not configured for this user.`,
      };
    }

    const memories = (await db.query("memories:listByUserAndScope", {
      userId: caller.userId,
      scope: "repository",
    })) as Array<{ repositoryFullName?: string; key: string; value: string; updatedAt: number }>;

    return {
      ok: true as const,
      repository: {
        fullName: repo.fullName,
        owner: repo.owner,
        name: repo.name,
        defaultBranch: repo.defaultBranch,
        autonomyLevel: repo.autonomyLevel,
        watchEnabled: repo.watchEnabled,
        watchExpiresAt: repo.watchExpiresAt,
        reviewPolicy: repo.reviewPolicy,
        notifyDrafts: repo.notifyDrafts,
        notifyCiFailures: repo.notifyCiFailures,
        autoReview: repo.autoReview,
        securityReview: repo.securityReview,
        branchFilters: repo.branchFilters,
        authorFilters: repo.authorFilters,
        labelFilters: repo.labelFilters,
        dailyDigest: repo.dailyDigest,
        weeklyDigest: repo.weeklyDigest,
      },
      memories: memories
        .filter((m) => m.repositoryFullName === repositoryFullName)
        .map((m) => ({ key: m.key, value: m.value, updatedAt: m.updatedAt })),
    };
  },
});
