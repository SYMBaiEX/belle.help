import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const upsert = mutation({
  args: {
    userId: v.id("users"),
    repositoryId: v.id("repositories"),
    number: v.number(),
    title: v.string(),
    authorLogin: v.string(),
    state: v.union(
      v.literal("open"),
      v.literal("closed"),
      v.literal("merged"),
      v.literal("draft"),
    ),
    headSha: v.string(),
    baseRef: v.string(),
    headRef: v.string(),
    additions: v.optional(v.number()),
    deletions: v.optional(v.number()),
    changedFiles: v.optional(v.number()),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pullRequests")
      .withIndex("by_repositoryId_number", (q) =>
        q.eq("repositoryId", args.repositoryId).eq("number", args.number),
      )
      .unique();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: args.userId,
        title: args.title,
        authorLogin: args.authorLogin,
        state: args.state,
        headSha: args.headSha,
        baseRef: args.baseRef,
        headRef: args.headRef,
        additions: args.additions,
        deletions: args.deletions,
        changedFiles: args.changedFiles,
        url: args.url,
        lastEventAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("pullRequests", {
      userId: args.userId,
      repositoryId: args.repositoryId,
      number: args.number,
      title: args.title,
      authorLogin: args.authorLogin,
      state: args.state,
      headSha: args.headSha,
      baseRef: args.baseRef,
      headRef: args.headRef,
      additions: args.additions,
      deletions: args.deletions,
      changedFiles: args.changedFiles,
      url: args.url,
      lastEventAt: now,
      createdAt: now,
    });
  },
});

export const getByRepoAndNumber = query({
  args: { repositoryId: v.id("repositories"), number: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pullRequests")
      .withIndex("by_repositoryId_number", (q) =>
        q.eq("repositoryId", args.repositoryId).eq("number", args.number),
      )
      .unique();
  },
});

export const listOpenByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const prs = await ctx.db
      .query("pullRequests")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .take(50);

    return prs.filter((pr) => pr.state === "open" || pr.state === "draft");
  },
});

export const setSession = mutation({
  args: {
    pullRequestId: v.id("pullRequests"),
    eveSessionId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.pullRequestId, {
      eveSessionId: args.eveSessionId,
    });
  },
});
