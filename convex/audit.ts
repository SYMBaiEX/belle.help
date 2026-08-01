import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const record = mutation({
  args: {
    userId: v.optional(v.id("users")),
    actor: v.union(v.literal("belle"), v.literal("user"), v.literal("system")),
    action: v.string(),
    repositoryFullName: v.optional(v.string()),
    prNumber: v.optional(v.number()),
    detail: v.optional(v.string()),
    refs: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("auditEvents", {
      userId: args.userId,
      actor: args.actor,
      action: args.action,
      repositoryFullName: args.repositoryFullName,
      prNumber: args.prNumber,
      detail: args.detail,
      refs: args.refs,
      createdAt: Date.now(),
    });
  },
});

export const listByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("auditEvents")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(100);
  },
});
