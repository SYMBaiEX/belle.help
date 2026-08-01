import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const DEFAULT_TTL_MS = 15 * 60 * 1000;

export const createRequest = mutation({
  args: {
    userId: v.id("users"),
    action: v.string(),
    repositoryFullName: v.string(),
    prNumber: v.optional(v.number()),
    headSha: v.optional(v.string()),
    findingIds: v.optional(v.array(v.id("reviewFindings"))),
    params: v.optional(v.any()),
    prompt: v.string(),
    channel: v.string(),
    ttlMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("approvalRequests", {
      userId: args.userId,
      action: args.action,
      repositoryFullName: args.repositoryFullName,
      prNumber: args.prNumber,
      headSha: args.headSha,
      findingIds: args.findingIds,
      params: args.params,
      prompt: args.prompt,
      status: "pending",
      channel: args.channel,
      createdAt: now,
      expiresAt: now + (args.ttlMs ?? DEFAULT_TTL_MS),
    });
  },
});

export const resolve = mutation({
  args: {
    id: v.id("approvalRequests"),
    status: v.union(v.literal("approved"), v.literal("denied")),
    userResponse: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.id);
    if (!approval) {
      return { ok: false as const, reason: "not_found" as const };
    }
    if (approval.status !== "pending") {
      return { ok: false as const, reason: "not_pending" as const };
    }
    if (approval.expiresAt < Date.now()) {
      await ctx.db.patch(args.id, { status: "expired" });
      return { ok: false as const, reason: "expired" as const };
    }

    await ctx.db.patch(args.id, {
      status: args.status,
      userResponse: args.userResponse,
      resolvedAt: Date.now(),
    });

    return { ok: true as const };
  },
});

export const getPending = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("approvalRequests")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
  },
});

export const consume = mutation({
  args: {
    approvalId: v.id("approvalRequests"),
    userId: v.string(),
    action: v.string(),
    repositoryFullName: v.string(),
    prNumber: v.optional(v.number()),
    expectedHeadSha: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.approvalId);
    if (!request) {
      return { ok: false as const, reason: "not found" };
    }
    if (request.userId !== (args.userId as typeof request.userId)) {
      return { ok: false as const, reason: "wrong user" };
    }
    if (request.action !== args.action) {
      return { ok: false as const, reason: "wrong action" };
    }
    if (request.repositoryFullName !== args.repositoryFullName) {
      return { ok: false as const, reason: "wrong repository" };
    }
    if (request.prNumber !== args.prNumber) {
      return { ok: false as const, reason: "wrong PR" };
    }
    if (
      args.expectedHeadSha !== undefined &&
      request.headSha !== undefined &&
      request.headSha !== args.expectedHeadSha
    ) {
      return { ok: false as const, reason: "head SHA changed" };
    }
    if (request.status !== "approved") {
      return { ok: false as const, reason: "not approved" };
    }
    if (request.expiresAt < Date.now()) {
      return { ok: false as const, reason: "expired" };
    }

    await ctx.db.patch(args.approvalId, {
      status: "consumed",
      resolvedAt: Date.now(),
    });

    return { ok: true as const };
  },
});

export const expireStale = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const pending = await ctx.db
      .query("approvalRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    let expiredCount = 0;
    for (const approval of pending) {
      if (approval.expiresAt < now) {
        await ctx.db.patch(approval._id, { status: "expired" });
        expiredCount += 1;
      }
    }

    return { expiredCount };
  },
});
