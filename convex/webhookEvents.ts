import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const recordIfNew = mutation({
  args: {
    provider: v.union(v.literal("linq"), v.literal("github")),
    externalEventId: v.string(),
    eventType: v.string(),
    deliveryId: v.optional(v.string()),
    verified: v.boolean(),
    userId: v.optional(v.id("users")),
    repositoryFullName: v.optional(v.string()),
    prNumber: v.optional(v.number()),
    eveSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("webhookEvents")
      .withIndex("by_provider_externalEventId", (q) =>
        q.eq("provider", args.provider).eq("externalEventId", args.externalEventId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        attemptCount: existing.attemptCount + 1,
        processingState: "duplicate",
      });
      return { duplicate: true as const, id: existing._id };
    }

    const id = await ctx.db.insert("webhookEvents", {
      provider: args.provider,
      externalEventId: args.externalEventId,
      eventType: args.eventType,
      deliveryId: args.deliveryId,
      verified: args.verified,
      receivedAt: Date.now(),
      processingState: "received",
      attemptCount: 1,
      userId: args.userId,
      repositoryFullName: args.repositoryFullName,
      prNumber: args.prNumber,
      eveSessionId: args.eveSessionId,
    });

    return { duplicate: false as const, id };
  },
});

export const markProcessed = mutation({
  args: { id: v.id("webhookEvents") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      processingState: "processed",
      processedAt: Date.now(),
    });
  },
});

export const markFailed = mutation({
  args: { id: v.id("webhookEvents"), errorSummary: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      processingState: "failed",
      processedAt: Date.now(),
      errorSummary: args.errorSummary,
    });
  },
});
