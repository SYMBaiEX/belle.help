import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("repositories")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const upsert = mutation({
  args: {
    userId: v.id("users"),
    installationId: v.number(),
    owner: v.string(),
    name: v.string(),
    fullName: v.string(),
    defaultBranch: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("repositories")
      .withIndex("by_userId_fullName", (q) =>
        q.eq("userId", args.userId).eq("fullName", args.fullName),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        installationId: args.installationId,
        owner: args.owner,
        name: args.name,
        defaultBranch: args.defaultBranch,
      });
      return existing._id;
    }

    return await ctx.db.insert("repositories", {
      userId: args.userId,
      installationId: args.installationId,
      owner: args.owner,
      name: args.name,
      fullName: args.fullName,
      defaultBranch: args.defaultBranch,
      autonomyLevel: 0,
      watchEnabled: false,
      reviewPolicy: "blocking_important",
      notifyDrafts: false,
      notifyCiFailures: true,
      autoReview: true,
      securityReview: true,
      dailyDigest: false,
      weeklyDigest: false,
      createdAt: Date.now(),
    });
  },
});

export const setWatch = mutation({
  args: {
    repositoryId: v.id("repositories"),
    watchEnabled: v.boolean(),
    watchExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.repositoryId, {
      watchEnabled: args.watchEnabled,
      watchExpiresAt: args.watchExpiresAt,
    });
  },
});

export const setAutonomy = mutation({
  args: {
    repositoryId: v.id("repositories"),
    autonomyLevel: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.repositoryId, {
      autonomyLevel: args.autonomyLevel,
    });
  },
});

export const getByUserAndFullName = query({
  args: { userId: v.id("users"), fullName: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("repositories")
      .withIndex("by_userId_fullName", (q) =>
        q.eq("userId", args.userId).eq("fullName", args.fullName),
      )
      .unique();
  },
});

export const listWatchersByFullName = query({
  args: { fullName: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const repos = await ctx.db
      .query("repositories")
      .withIndex("by_fullName", (q) => q.eq("fullName", args.fullName))
      .collect();

    return repos.filter(
      (repo) =>
        repo.watchEnabled &&
        (repo.watchExpiresAt === undefined || repo.watchExpiresAt > now),
    );
  },
});

/** Patch any subset of a repository's watch/policy configuration. */
export const updateConfig = mutation({
  args: {
    repositoryId: v.id("repositories"),
    watchEnabled: v.optional(v.boolean()),
    watchExpiresAt: v.optional(v.number()),
    autonomyLevel: v.optional(v.number()),
    autoReview: v.optional(v.boolean()),
    securityReview: v.optional(v.boolean()),
    notifyDrafts: v.optional(v.boolean()),
    notifyCiFailures: v.optional(v.boolean()),
    reviewPolicy: v.optional(
      v.union(
        v.literal("internal_only"),
        v.literal("blocking_only"),
        v.literal("blocking_important"),
        v.literal("high_confidence"),
        v.literal("always_ask"),
      ),
    ),
    branchFilters: v.optional(v.array(v.string())),
    authorFilters: v.optional(v.array(v.string())),
    labelFilters: v.optional(v.array(v.string())),
    quietHoursStart: v.optional(v.number()),
    quietHoursEnd: v.optional(v.number()),
    dailyDigest: v.optional(v.boolean()),
    weeklyDigest: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { repositoryId, ...fields } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(repositoryId, patch as never);
    }
    return repositoryId;
  },
});
