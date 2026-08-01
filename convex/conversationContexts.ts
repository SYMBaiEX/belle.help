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
