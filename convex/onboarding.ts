import { v } from "convex/values";
import { mutation } from "./_generated/server";

const DEFAULT_TTL_MS = 30 * 60 * 1000;

export const createSession = mutation({
  args: {
    tokenHash: v.string(),
    phoneIdentityId: v.id("phoneIdentities"),
    linqChatId: v.string(),
    ttlMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("onboardingSessions", {
      tokenHash: args.tokenHash,
      phoneIdentityId: args.phoneIdentityId,
      linqChatId: args.linqChatId,
      status: "pending",
      createdAt: now,
      expiresAt: now + (args.ttlMs ?? DEFAULT_TTL_MS),
    });
  },
});

export const consumeSession = mutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("onboardingSessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();

    if (!session) {
      return { ok: false as const, reason: "not_found" as const };
    }
    if (session.status !== "pending") {
      return { ok: false as const, reason: "already_used" as const };
    }
    if (session.expiresAt < Date.now()) {
      await ctx.db.patch(session._id, { status: "expired" });
      return { ok: false as const, reason: "expired" as const };
    }

    await ctx.db.patch(session._id, {
      status: "used",
      usedAt: Date.now(),
    });

    return { ok: true as const, session };
  },
});
