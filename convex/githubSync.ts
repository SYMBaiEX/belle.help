import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Additive Convex functions for the GitHub App install/sync flow (see
 * app/api/github/**). Kept separate from convex/repositories.ts and
 * convex/githubInstallations.ts per AGENTS.md scope — those files are not
 * to be modified for this change.
 */

export const syncRepositories = mutation({
  args: {
    userId: v.id("users"),
    installationId: v.number(),
    repos: v.array(
      v.object({
        owner: v.string(),
        name: v.string(),
        fullName: v.string(),
        defaultBranch: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const incomingFullNames = new Set(args.repos.map((r) => r.fullName));
    let added = 0;
    let updated = 0;

    for (const repo of args.repos) {
      const existing = await ctx.db
        .query("repositories")
        .withIndex("by_userId_fullName", (q) =>
          q.eq("userId", args.userId).eq("fullName", repo.fullName),
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          installationId: args.installationId,
          owner: repo.owner,
          name: repo.name,
          defaultBranch: repo.defaultBranch,
        });
        updated += 1;
      } else {
        await ctx.db.insert("repositories", {
          userId: args.userId,
          installationId: args.installationId,
          owner: repo.owner,
          name: repo.name,
          fullName: repo.fullName,
          defaultBranch: repo.defaultBranch,
          autonomyLevel: 1,
          watchEnabled: false,
          reviewPolicy: "always_ask",
          notifyDrafts: false,
          notifyCiFailures: true,
          autoReview: false,
          securityReview: true,
          dailyDigest: false,
          weeklyDigest: false,
          createdAt: Date.now(),
        });
        added += 1;
      }
    }

    // Repos previously synced under this installation that are no longer
    // in the incoming list have had their access removed — stop watching
    // them, but never delete the row (preserves history/config).
    const usersRepos = await ctx.db
      .query("repositories")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    for (const repo of usersRepos) {
      if (
        repo.installationId === args.installationId &&
        !incomingFullNames.has(repo.fullName) &&
        repo.watchEnabled
      ) {
        await ctx.db.patch(repo._id, { watchEnabled: false });
      }
    }

    return { added, updated, total: args.repos.length };
  },
});

export const listByUserWithStatus = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const [repos, installations] = await Promise.all([
      ctx.db
        .query("repositories")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .collect(),
      ctx.db
        .query("githubInstallations")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .collect(),
    ]);

    const activeInstallationIds = new Set(
      installations.filter((i) => i.status === "active").map((i) => i.installationId),
    );

    return repos.map((repo) => ({
      ...repo,
      installationActive: activeInstallationIds.has(repo.installationId),
    }));
  },
});
