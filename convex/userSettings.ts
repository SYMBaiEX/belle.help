import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Additive: user-level settings mutations that don't fit the narrow
 * `users.ts` create/getById/softDelete surface. Kept in a separate file so
 * we never have to touch existing convex/users.ts function logic.
 */

export const setAiMode = mutation({
  args: {
    userId: v.id("users"),
    aiMode: v.union(v.literal("byok"), v.literal("managed")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { aiMode: args.aiMode });
  },
});

export const getSettings = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});
