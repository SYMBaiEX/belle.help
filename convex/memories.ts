import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const scopeValidator = v.union(
  v.literal("user"),
  v.literal("repository"),
  v.literal("conversation"),
);

export const upsert = mutation({
  args: {
    userId: v.id("users"),
    scope: scopeValidator,
    key: v.string(),
    value: v.string(),
    repositoryFullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const candidates = await ctx.db
      .query("memories")
      .withIndex("by_userId_scope", (q) =>
        q.eq("userId", args.userId).eq("scope", args.scope),
      )
      .collect();

    const existing = candidates.find(
      (memory) =>
        memory.key === args.key &&
        memory.repositoryFullName === args.repositoryFullName,
    );

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("memories", {
      userId: args.userId,
      scope: args.scope,
      repositoryFullName: args.repositoryFullName,
      key: args.key,
      value: args.value,
      updatedAt: now,
    });
  },
});

export const listByUserAndScope = query({
  args: {
    userId: v.id("users"),
    scope: scopeValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("memories")
      .withIndex("by_userId_scope", (q) =>
        q.eq("userId", args.userId).eq("scope", args.scope),
      )
      .collect();
  },
});

export const remove = mutation({
  args: { memoryId: v.id("memories") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.memoryId);
  },
});
