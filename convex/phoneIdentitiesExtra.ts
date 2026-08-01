import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Additive: lookups convex/phoneIdentities.ts doesn't already expose.
 * Neither is backed by a dedicated index (phoneIdentities only indexes
 * by_phoneHash and by_linqChatId), so these do a bounded table scan —
 * acceptable at Belle's current phone-identity volume.
 */

export const getById = query({
  args: { phoneIdentityId: v.id("phoneIdentities") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.phoneIdentityId);
  },
});

export const getByUserId = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("phoneIdentities").collect();
    return all.find((identity) => identity.userId === args.userId) ?? null;
  },
});
