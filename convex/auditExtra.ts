import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Additive: audit events scoped to a single repository + PR, for the PR
 * detail page's "full per-PR audit trail". auditEvents only has a
 * `by_userId` index, so we take a bounded recent window for the user and
 * filter in memory — acceptable at Belle's current per-user audit volume.
 */
export const listByUserAndPr = query({
  args: {
    userId: v.id("users"),
    repositoryFullName: v.string(),
    prNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("auditEvents")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(500);

    return events.filter(
      (event) =>
        event.repositoryFullName === args.repositoryFullName &&
        event.prNumber === args.prNumber,
    );
  },
});

/** Additive: paginated audit list for the audit log page. */
export const listByUserPaginated = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("auditEvents")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(Math.min(args.limit ?? 100, 500));
  },
});
