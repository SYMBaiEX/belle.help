import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    userId: v.id("users"),
    pullRequestId: v.id("pullRequests"),
    headSha: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("reviewRuns", {
      userId: args.userId,
      pullRequestId: args.pullRequestId,
      headSha: args.headSha,
      status: "running",
      blockingCount: 0,
      importantCount: 0,
      suggestionCount: 0,
      startedAt: Date.now(),
    });
  },
});

export const complete = mutation({
  args: {
    reviewRunId: v.id("reviewRuns"),
    summary: v.string(),
    blockingCount: v.number(),
    importantCount: v.number(),
    suggestionCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reviewRunId, {
      status: "completed",
      summary: args.summary,
      blockingCount: args.blockingCount,
      importantCount: args.importantCount,
      suggestionCount: args.suggestionCount,
      completedAt: Date.now(),
    });
  },
});

export const fail = mutation({
  args: {
    reviewRunId: v.id("reviewRuns"),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reviewRunId, {
      status: "failed",
      summary: args.error,
      completedAt: Date.now(),
    });
  },
});

export const getLatestForPr = query({
  args: { pullRequestId: v.id("pullRequests") },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("reviewRuns")
      .withIndex("by_pullRequestId", (q) =>
        q.eq("pullRequestId", args.pullRequestId),
      )
      .collect();

    return runs.reduce<(typeof runs)[number] | null>((latest, run) => {
      if (!latest || run.startedAt > latest.startedAt) {
        return run;
      }
      return latest;
    }, null);
  },
});

export const listByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reviewRuns")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(50);
  },
});
