import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Admin operator accounts (email + scrypt password hash), distinct from
 * Belle's phone-based `users` table. Server-only usage — the hash/salt
 * fields must never be sent to a client bundle. See lib/auth/admin.ts for
 * the hashing/verification logic (Node crypto; runs in Next.js, not here).
 */

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("adminUsers")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();
  },
});

export const seedIfMissing = mutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase();
    const existing = await ctx.db
      .query("adminUsers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) {
      return { created: false as const };
    }

    await ctx.db.insert("adminUsers", {
      email,
      passwordHash: args.passwordHash,
      passwordSalt: args.passwordSalt,
      mustChangePassword: true,
      createdAt: Date.now(),
    });

    return { created: true as const };
  },
});

export const recordLogin = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase();
    const admin = await ctx.db
      .query("adminUsers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!admin) return;
    await ctx.db.patch(admin._id, { lastLoginAt: Date.now() });
  },
});

export const updatePassword = mutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase();
    const admin = await ctx.db
      .query("adminUsers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!admin) {
      throw new Error("Admin account not found.");
    }
    await ctx.db.patch(admin._id, {
      passwordHash: args.passwordHash,
      passwordSalt: args.passwordSalt,
      mustChangePassword: false,
      passwordChangedAt: Date.now(),
    });
  },
});
