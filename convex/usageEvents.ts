import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const record = mutation({
  args: {
    userId: v.id("users"),
    kind: v.string(),
    amount: v.number(),
    unit: v.string(),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("usageEvents", {
      userId: args.userId,
      kind: args.kind,
      amount: args.amount,
      unit: args.unit,
      meta: args.meta,
      createdAt: Date.now(),
    });
  },
});

export const sumByUserAndKind = query({
  args: {
    userId: v.id("users"),
    kind: v.string(),
    sinceMs: v.number(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("usageEvents")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .take(1000);

    return events
      .filter((event) => event.kind === args.kind && event.createdAt >= args.sinceMs)
      .reduce((sum, event) => sum + event.amount, 0);
  },
});
