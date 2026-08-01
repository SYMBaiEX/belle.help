import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Additive: encrypted per-user credential storage (currently BYOK OpenAI API
 * keys). Ciphertext/iv/authTag are produced by lib/encryption before this
 * mutation is called — Convex never sees plaintext secrets.
 */

export const create = mutation({
  args: {
    userId: v.id("users"),
    kind: v.literal("openai_api_key"),
    ciphertext: v.string(),
    iv: v.string(),
    authTag: v.string(),
    keyVersion: v.number(),
    last4: v.string(),
  },
  handler: async (ctx, args) => {
    // Revoke any existing live credential of this kind before storing the
    // new one, so a user only ever has one active key per kind.
    const existing = await ctx.db
      .query("encryptedCredentials")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    for (const credential of existing) {
      if (credential.kind === args.kind && credential.revokedAt === undefined) {
        await ctx.db.patch(credential._id, { revokedAt: Date.now() });
      }
    }

    return await ctx.db.insert("encryptedCredentials", {
      userId: args.userId,
      kind: args.kind,
      ciphertext: args.ciphertext,
      iv: args.iv,
      authTag: args.authTag,
      keyVersion: args.keyVersion,
      last4: args.last4,
      createdAt: Date.now(),
    });
  },
});

export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const credentials = await ctx.db
      .query("encryptedCredentials")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    return credentials.filter((c) => c.revokedAt === undefined);
  },
});

export const revoke = mutation({
  args: { credentialId: v.id("encryptedCredentials"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const credential = await ctx.db.get(args.credentialId);
    if (!credential || credential.userId !== args.userId) {
      return { ok: false as const, reason: "not_found" as const };
    }
    await ctx.db.patch(args.credentialId, { revokedAt: Date.now() });
    return { ok: true as const };
  },
});

export const revokeAllForUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const credentials = await ctx.db
      .query("encryptedCredentials")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const credential of credentials) {
      if (credential.revokedAt === undefined) {
        await ctx.db.patch(credential._id, { revokedAt: Date.now() });
      }
    }
  },
});
