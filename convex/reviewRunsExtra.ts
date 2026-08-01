import { v } from "convex/values";
import { query } from "./_generated/server";

/** Additive: fetch a single review run by id, for the review detail page. */
export const getById = query({
  args: { reviewRunId: v.id("reviewRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.reviewRunId);
  },
});
