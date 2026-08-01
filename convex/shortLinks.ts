import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    code: v.string(),
    target: v.string(),
    kind: v.union(
      v.literal("onboarding"),
      v.literal("github_connect"),
      v.literal("dashboard"),
    ),
    userId: v.optional(v.id("users")),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("shortLinks")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();

    if (existing) {
      throw new Error(`Short link code "${args.code}" already exists.`);
    }

    await ctx.db.insert("shortLinks", {
      code: args.code,
      target: args.target,
      kind: args.kind,
      userId: args.userId,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
      useCount: 0,
    });

    return args.code;
  },
});

export const resolve = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("shortLinks")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();

    if (!link) return null;
    if (link.expiresAt !== undefined && link.expiresAt < Date.now()) {
      return null;
    }

    await ctx.db.patch(link._id, {
      useCount: link.useCount + 1,
      usedAt: link.usedAt ?? Date.now(),
    });

    return { target: link.target, kind: link.kind };
  },
});

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shortLinks")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
  },
});
