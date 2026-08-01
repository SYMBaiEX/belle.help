import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const findingObject = v.object({
  userId: v.id("users"),
  reviewRunId: v.id("reviewRuns"),
  severity: v.union(
    v.literal("blocking"),
    v.literal("important"),
    v.literal("suggestion"),
  ),
  confidence: v.union(
    v.literal("high"),
    v.literal("medium"),
    v.literal("low"),
  ),
  file: v.string(),
  startLine: v.optional(v.number()),
  endLine: v.optional(v.number()),
  title: v.string(),
  explanation: v.string(),
  impact: v.optional(v.string()),
  evidence: v.optional(v.string()),
  suggestedResolution: v.optional(v.string()),
  blocksMerge: v.boolean(),
  publishedToGitHub: v.boolean(),
  dismissedAt: v.optional(v.number()),
});

export const createMany = mutation({
  args: { findings: v.array(findingObject) },
  handler: async (ctx, args) => {
    const ids = [];
    for (const finding of args.findings) {
      const id = await ctx.db.insert("reviewFindings", finding);
      ids.push(id);
    }
    return ids;
  },
});

export const listByRun = query({
  args: { reviewRunId: v.id("reviewRuns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reviewFindings")
      .withIndex("by_reviewRunId", (q) =>
        q.eq("reviewRunId", args.reviewRunId),
      )
      .collect();
  },
});

export const markPublished = mutation({
  args: { findingId: v.id("reviewFindings") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.findingId, { publishedToGitHub: true });
  },
});

export const dismiss = mutation({
  args: { findingId: v.id("reviewFindings") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.findingId, { dismissedAt: Date.now() });
  },
});
