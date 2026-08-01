import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Additive getters/setters for repositories that convex/repositories.ts
 * doesn't already expose — kept separate so repositories.ts logic is
 * untouched.
 */

export const getById = query({
  args: { repositoryId: v.id("repositories") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.repositoryId);
  },
});

export const setReviewPolicy = mutation({
  args: {
    repositoryId: v.id("repositories"),
    reviewPolicy: v.union(
      v.literal("internal_only"),
      v.literal("blocking_only"),
      v.literal("blocking_important"),
      v.literal("high_confidence"),
      v.literal("always_ask"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.repositoryId, { reviewPolicy: args.reviewPolicy });
  },
});

export const setNotifications = mutation({
  args: {
    repositoryId: v.id("repositories"),
    notifyDrafts: v.optional(v.boolean()),
    notifyCiFailures: v.optional(v.boolean()),
    autoReview: v.optional(v.boolean()),
    securityReview: v.optional(v.boolean()),
    dailyDigest: v.optional(v.boolean()),
    weeklyDigest: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.notifyDrafts !== undefined) patch.notifyDrafts = args.notifyDrafts;
    if (args.notifyCiFailures !== undefined) patch.notifyCiFailures = args.notifyCiFailures;
    if (args.autoReview !== undefined) patch.autoReview = args.autoReview;
    if (args.securityReview !== undefined) patch.securityReview = args.securityReview;
    if (args.dailyDigest !== undefined) patch.dailyDigest = args.dailyDigest;
    if (args.weeklyDigest !== undefined) patch.weeklyDigest = args.weeklyDigest;
    await ctx.db.patch(args.repositoryId, patch);
  },
});

export const setFilters = mutation({
  args: {
    repositoryId: v.id("repositories"),
    branchFilters: v.optional(v.array(v.string())),
    authorFilters: v.optional(v.array(v.string())),
    labelFilters: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.branchFilters !== undefined) patch.branchFilters = args.branchFilters;
    if (args.authorFilters !== undefined) patch.authorFilters = args.authorFilters;
    if (args.labelFilters !== undefined) patch.labelFilters = args.labelFilters;
    await ctx.db.patch(args.repositoryId, patch);
  },
});

export const setQuietHours = mutation({
  args: {
    repositoryId: v.id("repositories"),
    quietHoursStart: v.optional(v.number()),
    quietHoursEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.repositoryId, {
      quietHoursStart: args.quietHoursStart,
      quietHoursEnd: args.quietHoursEnd,
    });
  },
});
