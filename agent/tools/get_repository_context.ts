import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "../lib/convex";
import { requireTenantCaller } from "../lib/tenant";

export default defineTool({
  description:
    "Get a repository's Belle configuration (autonomy level, review policy, notification/watch filters) plus any repository-scoped memories Belle has recorded about it.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
  }),
  async execute({ repositoryFullName }, ctx) {
    const caller = requireTenantCaller(ctx);

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
      throw new Error(`Repository ${repositoryFullName} is not configured for this user.`);
    }

    const memories = (await db.query("memories:listByUserAndScope", {
      userId: caller.userId,
      scope: "repository",
    })) as Array<{ repositoryFullName?: string; key: string; value: string; updatedAt: number }>;

    return {
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
