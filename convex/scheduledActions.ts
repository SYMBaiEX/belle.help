import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const enqueue = mutation({
  args: {
    userId: v.id("users"),
    kind: v.union(
      v.literal("auto_review"),
      v.literal("scheduled_merge"),
      v.literal("reminder"),
      v.literal("watch_expiry"),
    ),
    repositoryFullName: v.optional(v.string()),
    prNumber: v.optional(v.number()),
    headSha: v.optional(v.string()),
    payload: v.optional(v.any()),
    runAfter: v.optional(v.number()),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("scheduledActions", {
      userId: args.userId,
      kind: args.kind,
      repositoryFullName: args.repositoryFullName,
      prNumber: args.prNumber,
      headSha: args.headSha,
      payload: args.payload,
      runAfter: args.runAfter,
      status: "queued",
      createdAt: args.createdAt ?? Date.now(),
    });
  },
});

/** Queued actions that are due now (runAfter unset or in the past). */
export const listDue = query({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const queued = await ctx.db
      .query("scheduledActions")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .take(100);
    return queued.filter((a) => a.runAfter === undefined || a.runAfter <= args.now);
  },
});

export const markDispatched = mutation({
  args: { actionId: v.id("scheduledActions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.actionId, { status: "dispatched", dispatchedAt: Date.now() });
  },
});

export const markCompleted = mutation({
  args: { actionId: v.id("scheduledActions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.actionId, { status: "completed" });
  },
});

export const markFailed = mutation({
  args: { actionId: v.id("scheduledActions"), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.actionId, { status: "failed", error: args.error });
  },
});

export const cancelByUser = mutation({
  args: { userId: v.id("users"), kind: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actions = await ctx.db
      .query("scheduledActions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const action of actions) {
      if (action.status !== "queued") continue;
      if (args.kind && action.kind !== args.kind) continue;
      await ctx.db.patch(action._id, { status: "cancelled" });
    }
  },
});
