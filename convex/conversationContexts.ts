import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByLinqChatId = query({
  args: { linqChatId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversationContexts")
      .withIndex("by_linqChatId", (q) => q.eq("linqChatId", args.linqChatId))
      .unique();
  },
});

export const getByUserId = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const contexts = await ctx.db
      .query("conversationContexts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    return contexts.reduce<(typeof contexts)[number] | null>(
      (newest, context) => {
        if (!newest || context.updatedAt > newest.updatedAt) {
          return context;
        }
        return newest;
      },
      null,
    );
  },
});

/**
 * Conversations the watchdog should inspect: every context that has a durable
 * eve session and has seen activity recently. A chat with no session id was
 * never dispatched to the model, so it cannot be wedged.
 */
export const listWatchable = query({
  args: { activeSinceMs: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.activeSinceMs;
    const contexts = await ctx.db.query("conversationContexts").collect();

    return contexts
      .filter((c) => c.eveSessionId !== undefined && c.updatedAt >= cutoff)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, args.limit ?? 50)
      .map((c) => ({
        _id: c._id,
        userId: c.userId,
        linqChatId: c.linqChatId,
        eveSessionId: c.eveSessionId,
        lastRecoveredMessageId: c.lastRecoveredMessageId,
      }));
  },
});

/**
 * Ask for the durable session behind a chat to be retired at the next safe
 * boundary. Addressed by chat id so an operator can call it without knowing
 * anything about eve session ids.
 */
export const requestRetire = mutation({
  args: { linqChatId: v.string() },
  handler: async (ctx, args) => {
    const context = await ctx.db
      .query("conversationContexts")
      .withIndex("by_linqChatId", (q) => q.eq("linqChatId", args.linqChatId))
      .unique();
    if (!context) return { ok: false as const, reason: "unknown_chat" };

    await ctx.db.patch(context._id, { retireRequested: true, updatedAt: Date.now() });
    return { ok: true as const, eveSessionId: context.eveSessionId ?? null };
  },
});

/** Whether this chat's session should be retired now. */
export const retireState = query({
  args: { linqChatId: v.string() },
  handler: async (ctx, args) => {
    const context = await ctx.db
      .query("conversationContexts")
      .withIndex("by_linqChatId", (q) => q.eq("linqChatId", args.linqChatId))
      .unique();
    return { retireRequested: context?.retireRequested === true };
  },
});

/** Clear the retire flag once the continuation token has been released. */
export const markRetired = mutation({
  args: { linqChatId: v.string() },
  handler: async (ctx, args) => {
    const context = await ctx.db
      .query("conversationContexts")
      .withIndex("by_linqChatId", (q) => q.eq("linqChatId", args.linqChatId))
      .unique();
    if (!context) return;

    // Drop the stale session pointer with the flag: it names a session that no
    // longer owns this conversation, and leaving it would let the watchdog
    // cancel turns on an abandoned session.
    await ctx.db.patch(context._id, {
      retireRequested: false,
      retiredAt: Date.now(),
      eveSessionId: undefined,
      updatedAt: Date.now(),
    });
  },
});

/** Record that a wedged session was cancelled for this inbound message. */
export const markRecovered = mutation({
  args: { id: v.id("conversationContexts"), messageId: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      lastRecoveredMessageId: args.messageId,
      lastRecoveredAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const upsert = mutation({
  args: {
    userId: v.id("users"),
    linqChatId: v.string(),
    eveSessionId: v.optional(v.string()),
    activeRepositoryFullName: v.optional(v.string()),
    activePrNumber: v.optional(v.number()),
    activeHeadSha: v.optional(v.string()),
    pendingApprovalId: v.optional(v.id("approvalRequests")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("conversationContexts")
      .withIndex("by_linqChatId", (q) => q.eq("linqChatId", args.linqChatId))
      .unique();

    // Only touch fields the caller provided — a context refresh from the Linq
    // channel must not wipe the active PR set by a GitHub event (and vice
    // versa). In Convex, patching a field to `undefined` clears it.
    const patch: Record<string, unknown> = {
      userId: args.userId,
      linqChatId: args.linqChatId,
      updatedAt: Date.now(),
    };
    if (args.eveSessionId !== undefined) patch.eveSessionId = args.eveSessionId;
    if (args.activeRepositoryFullName !== undefined) {
      patch.activeRepositoryFullName = args.activeRepositoryFullName;
    }
    if (args.activePrNumber !== undefined) patch.activePrNumber = args.activePrNumber;
    if (args.activeHeadSha !== undefined) patch.activeHeadSha = args.activeHeadSha;
    if (args.pendingApprovalId !== undefined) patch.pendingApprovalId = args.pendingApprovalId;

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("conversationContexts", patch as never);
  },
});

/** Update the active PR pointer for a user's newest conversation. */
export const setActivePr = mutation({
  args: {
    userId: v.id("users"),
    repositoryFullName: v.string(),
    prNumber: v.number(),
    headSha: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const contexts = await ctx.db
      .query("conversationContexts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    const newest = contexts.reduce<(typeof contexts)[number] | null>(
      (best, c) => (!best || c.updatedAt > best.updatedAt ? c : best),
      null,
    );
    if (!newest) return null;
    await ctx.db.patch(newest._id, {
      activeRepositoryFullName: args.repositoryFullName,
      activePrNumber: args.prNumber,
      activeHeadSha: args.headSha,
      updatedAt: Date.now(),
    });
    return newest._id;
  },
});
