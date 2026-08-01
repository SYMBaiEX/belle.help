import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const recordIfNew = mutation({
  args: {
    userId: v.optional(v.id("users")),
    linqChatId: v.string(),
    idempotencyKey: v.string(),
    body: v.string(),
    traceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("outboundMessages")
      .withIndex("by_idempotencyKey", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();

    if (existing) {
      return { duplicate: true as const, id: existing._id };
    }

    const id = await ctx.db.insert("outboundMessages", {
      userId: args.userId,
      linqChatId: args.linqChatId,
      idempotencyKey: args.idempotencyKey,
      body: args.body,
      status: "queued",
      traceId: args.traceId,
      createdAt: Date.now(),
    });

    return { duplicate: false as const, id };
  },
});

export const markSent = mutation({
  args: { id: v.id("outboundMessages") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "sent", sentAt: Date.now() });
  },
});

export const markFailed = mutation({
  args: { id: v.id("outboundMessages") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "failed" });
  },
});
