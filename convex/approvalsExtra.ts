import { v } from "convex/values";
import { query } from "./_generated/server";

/** Additive: full approval history (any status) for a user, for the dashboard. */
export const listByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("approvalRequests")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(100);
  },
});
