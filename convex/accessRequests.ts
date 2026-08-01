import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Invite-only manual approval queue. A user's first inbound message
 * creates a pending accessRequest keyed on their phoneIdentity; an admin
 * approves or denies it from /admin. See also convex/inviteCodes.ts for
 * the self-serve alternative that skips the queue entirely.
 */

export const createIfNew = mutation({
  args: {
    phoneIdentityId: v.id("phoneIdentities"),
    phoneLast4: v.string(),
    linqChatId: v.string(),
    firstMessagePreview: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("accessRequests")
      .withIndex("by_phoneIdentityId", (q) =>
        q.eq("phoneIdentityId", args.phoneIdentityId),
      )
      .unique();

    if (existing) {
      return { requestId: existing._id, status: existing.status, created: false as const };
    }

    const requestId = await ctx.db.insert("accessRequests", {
      phoneIdentityId: args.phoneIdentityId,
      phoneLast4: args.phoneLast4,
      linqChatId: args.linqChatId,
      status: "pending",
      firstMessageAt: Date.now(),
      firstMessagePreview: args.firstMessagePreview,
    });

    return { requestId, status: "pending" as const, created: true as const };
  },
});

export const getByPhoneIdentity = query({
  args: { phoneIdentityId: v.id("phoneIdentities") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("accessRequests")
      .withIndex("by_phoneIdentityId", (q) =>
        q.eq("phoneIdentityId", args.phoneIdentityId),
      )
      .unique();
  },
});

export const getByLinqChatId = query({
  args: { linqChatId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("accessRequests")
      .withIndex("by_linqChatId", (q) => q.eq("linqChatId", args.linqChatId))
      .unique();
  },
});

export const listByStatus = query({
  args: {
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("accessRequests")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const counts = query({
  args: {},
  handler: async (ctx) => {
    const [pending, approved, denied] = await Promise.all([
      ctx.db
        .query("accessRequests")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .collect(),
      ctx.db
        .query("accessRequests")
        .withIndex("by_status", (q) => q.eq("status", "approved"))
        .collect(),
      ctx.db
        .query("accessRequests")
        .withIndex("by_status", (q) => q.eq("status", "denied"))
        .collect(),
    ]);
    return {
      pending: pending.length,
      approved: approved.length,
      denied: denied.length,
    };
  },
});

export const approve = mutation({
  args: {
    requestId: v.id("accessRequests"),
    adminEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Access request not found.");
    }

    if (request.status === "approved") {
      return {
        linqChatId: request.linqChatId,
        phoneIdentityId: request.phoneIdentityId,
        userId: request.userId ?? null,
        alreadyApproved: true as const,
      };
    }

    await ctx.db.patch(args.requestId, {
      status: "approved",
      resolvedAt: Date.now(),
      resolvedBy: args.adminEmail,
    });

    let userId = request.userId ?? null;
    if (!userId) {
      const phoneIdentity = await ctx.db.get(request.phoneIdentityId);
      userId = phoneIdentity?.userId ?? null;
    }

    if (userId) {
      await ctx.db.patch(userId, {
        approvalStatus: "approved",
        approvedAt: Date.now(),
        approvedBy: args.adminEmail,
      });
    }

    return {
      linqChatId: request.linqChatId,
      phoneIdentityId: request.phoneIdentityId,
      userId,
      alreadyApproved: false as const,
    };
  },
});

export const deny = mutation({
  args: {
    requestId: v.id("accessRequests"),
    adminEmail: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Access request not found.");
    }

    await ctx.db.patch(args.requestId, {
      status: "denied",
      resolvedAt: Date.now(),
      resolvedBy: args.adminEmail,
      note: args.note,
    });

    let userId = request.userId ?? null;
    if (!userId) {
      const phoneIdentity = await ctx.db.get(request.phoneIdentityId);
      userId = phoneIdentity?.userId ?? null;
    }

    if (userId) {
      await ctx.db.patch(userId, {
        approvalStatus: "denied",
        approvedBy: args.adminEmail,
      });
    }

    return { ok: true as const };
  },
});

export const markApprovedNotified = mutation({
  args: { requestId: v.id("accessRequests") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.requestId, { approvedNotifiedAt: Date.now() });
  },
});

export const markNudged = mutation({
  args: { requestId: v.id("accessRequests") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.requestId, { lastNudgeAt: Date.now() });
  },
});

export const attachUser = mutation({
  args: {
    requestId: v.id("accessRequests"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.requestId, { userId: args.userId });
  },
});
