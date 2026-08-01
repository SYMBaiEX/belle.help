import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByPhoneHash = query({
  args: { phoneHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("phoneIdentities")
      .withIndex("by_phoneHash", (q) => q.eq("phoneHash", args.phoneHash))
      .unique();
  },
});

export const getByLinqChatId = query({
  args: { linqChatId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("phoneIdentities")
      .withIndex("by_linqChatId", (q) => q.eq("linqChatId", args.linqChatId))
      .unique();
  },
});

export const create = mutation({
  args: {
    phoneHash: v.string(),
    phoneLast4: v.string(),
    protocol: v.optional(
      v.union(v.literal("imessage"), v.literal("rcs"), v.literal("sms")),
    ),
    linqChatId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("phoneIdentities", {
      phoneHash: args.phoneHash,
      phoneLast4: args.phoneLast4,
      protocol: args.protocol,
      linqChatId: args.linqChatId,
      createdAt: Date.now(),
    });
  },
});

export const attachUser = mutation({
  args: {
    phoneIdentityId: v.id("phoneIdentities"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.phoneIdentityId, {
      userId: args.userId,
      verifiedAt: Date.now(),
    });
  },
});
