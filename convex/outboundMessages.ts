import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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

/**
 * Messages that were recorded but never confirmed sent.
 *
 * `recordIfNew` writes the row *before* the Linq call, so an invocation that
 * dies mid-flight (or a transient Linq error) leaves a message stranded at
 * "queued"/"failed". The flush schedule drains these, which is what makes
 * notification delivery at-least-once rather than best-effort.
 */
export const listUnsent = query({
  args: {
    olderThanMs: v.optional(v.number()),
    maxAgeMs: v.optional(v.number()),
    maxAttempts: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const settleGrace = args.olderThanMs ?? 60_000; // let the live path finish first
    const maxAge = args.maxAgeMs ?? 24 * 60 * 60 * 1000; // stop chasing stale news
    const maxAttempts = args.maxAttempts ?? 5;

    const queued = await ctx.db
      .query("outboundMessages")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .take(200);
    const failed = await ctx.db
      .query("outboundMessages")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .take(200);

    return [...queued, ...failed]
      .filter((m) => {
        if (now - m.createdAt < settleGrace) return false;
        if (now - m.createdAt > maxAge) return false;
        if ((m.attempts ?? 0) >= maxAttempts) return false;
        // Back off between attempts rather than hammering a failing provider.
        if (m.lastAttemptAt && now - m.lastAttemptAt < 60_000 * ((m.attempts ?? 0) + 1)) return false;
        return true;
      })
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, args.limit ?? 20);
  },
});

export const recordAttempt = mutation({
  args: { id: v.id("outboundMessages") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) return;
    await ctx.db.patch(args.id, {
      attempts: (doc.attempts ?? 0) + 1,
      lastAttemptAt: Date.now(),
    });
  },
});
