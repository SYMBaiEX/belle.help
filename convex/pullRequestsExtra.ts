import { v } from "convex/values";
import { query } from "./_generated/server";

/** Additive: fetch a single pull request by its Convex id, for the PR detail page. */
export const getById = query({
  args: { pullRequestId: v.id("pullRequests") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.pullRequestId);
  },
});
