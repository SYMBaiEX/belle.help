import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Self-serve invite codes. Redeeming a code approves the user directly,
 * bypassing the manual accessRequests queue (convex/accessRequests.ts) —
 * but if a pending accessRequest already exists for that user (or their
 * phone identity), it's resolved too so the admin queue stays accurate.
 */

function computeStatus(code: {
  revokedAt?: number;
  expiresAt?: number;
  usedCount: number;
  maxUses: number;
}): "active" | "exhausted" | "revoked" | "expired" {
  if (code.revokedAt) return "revoked";
  if (code.expiresAt && code.expiresAt < Date.now()) return "expired";
  if (code.usedCount >= code.maxUses) return "exhausted";
  return "active";
}

export const create = mutation({
  args: {
    code: v.string(),
    createdBy: v.string(),
    note: v.optional(v.string()),
    maxUses: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const normalized = args.code.trim().toUpperCase();
    const existing = await ctx.db
      .query("inviteCodes")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .unique();
    if (existing) {
      throw new Error(`Invite code "${normalized}" already exists.`);
    }

    return await ctx.db.insert("inviteCodes", {
      code: normalized,
      createdBy: args.createdBy,
      note: args.note,
      maxUses: args.maxUses ?? 1,
      usedCount: 0,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("inviteCodes").order("desc").collect();
    return all.map((code) => ({ ...code, status: computeStatus(code) }));
  },
});

export const revoke = mutation({
  args: { inviteCodeId: v.id("inviteCodes") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.inviteCodeId, { revokedAt: Date.now() });
  },
});

export const validate = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const normalized = args.code.trim().toUpperCase();
    const code = await ctx.db
      .query("inviteCodes")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .unique();

    if (!code) {
      return { valid: false as const, reason: "not_found" as const };
    }
    if (code.revokedAt) {
      return { valid: false as const, reason: "revoked" as const };
    }
    if (code.expiresAt && code.expiresAt < Date.now()) {
      return { valid: false as const, reason: "expired" as const };
    }
    if (code.usedCount >= code.maxUses) {
      return { valid: false as const, reason: "exhausted" as const };
    }

    return { valid: true as const };
  },
});

export const redeem = mutation({
  args: {
    code: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const normalized = args.code.trim().toUpperCase();
    const code = await ctx.db
      .query("inviteCodes")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .unique();

    if (!code) {
      return { ok: false as const, reason: "not_found" as const };
    }
    if (code.revokedAt) {
      return { ok: false as const, reason: "revoked" as const };
    }
    if (code.expiresAt && code.expiresAt < Date.now()) {
      return { ok: false as const, reason: "expired" as const };
    }
    if (code.usedCount >= code.maxUses) {
      return { ok: false as const, reason: "exhausted" as const };
    }

    await ctx.db.patch(code._id, { usedCount: code.usedCount + 1 });

    const resolvedBy = `invite:${normalized}`;
    await ctx.db.patch(args.userId, {
      approvalStatus: "approved",
      approvedAt: Date.now(),
      approvedBy: resolvedBy,
      inviteCodeUsed: normalized,
    });

    // Resolve any accessRequest linked to this user, or to a phoneIdentity
    // that belongs to this user, so the admin queue doesn't show a stale
    // pending row for someone who self-served with a code.
    const all = await ctx.db.query("accessRequests").collect();
    let linqChatId: string | undefined;
    for (const request of all) {
      if (request.status !== "pending") continue;
      let matches = request.userId === args.userId;
      if (!matches) {
        const phoneIdentity = await ctx.db.get(request.phoneIdentityId);
        matches = phoneIdentity?.userId === args.userId;
      }
      if (matches) {
        await ctx.db.patch(request._id, {
          status: "approved",
          resolvedAt: Date.now(),
          resolvedBy,
        });
        linqChatId = request.linqChatId;
      }
    }

    return { ok: true as const, linqChatId };
  },
});
