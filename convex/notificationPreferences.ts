import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const modeValidator = v.union(
  v.literal("all"),
  v.literal("security_only"),
  v.literal("ci_failures_only"),
);

export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("notificationPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

export const upsert = mutation({
  args: {
    userId: v.id("users"),
    quietHoursStart: v.optional(v.number()),
    quietHoursEnd: v.optional(v.number()),
    timeZone: v.optional(v.string()),
    digestHour: v.optional(v.number()),
    bundlingWindowSec: v.optional(v.number()),
    snoozedUntil: v.optional(v.number()),
    mode: modeValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    const patch = {
      userId: args.userId,
      quietHoursStart: args.quietHoursStart,
      quietHoursEnd: args.quietHoursEnd,
      timeZone: args.timeZone,
      digestHour: args.digestHour,
      bundlingWindowSec: args.bundlingWindowSec,
      snoozedUntil: args.snoozedUntil,
      mode: args.mode,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("notificationPreferences", patch);
  },
});
