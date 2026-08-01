import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const create = mutation({
  args: {
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    timeZone: v.optional(v.string()),
    defaultMergeMethod: v.optional(
      v.union(v.literal("merge"), v.literal("squash"), v.literal("rebase")),
    ),
    aiMode: v.optional(v.union(v.literal("byok"), v.literal("managed"))),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      timeZone: args.timeZone,
      defaultMergeMethod: args.defaultMergeMethod,
      aiMode: args.aiMode ?? "managed",
      createdAt: Date.now(),
    });
  },
});

export const softDelete = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { deletedAt: Date.now() });
  },
});

export const setApprovalStatus = mutation({
  args: {
    userId: v.id("users"),
    approvalStatus: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
    ),
    approvedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      approvalStatus: args.approvalStatus,
      approvedAt: args.approvalStatus === "approved" ? Date.now() : undefined,
      approvedBy: args.approvedBy,
    });
  },
});

export const getApprovalStatus = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return {
      approvalStatus: user?.approvalStatus ?? null,
      inviteCodeUsed: user?.inviteCodeUsed ?? null,
    };
  },
});
