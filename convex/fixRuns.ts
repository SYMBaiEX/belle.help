import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const validationObject = v.object({
  typecheck: v.optional(
    v.union(v.literal("passed"), v.literal("failed"), v.literal("skipped")),
  ),
  tests: v.optional(
    v.union(v.literal("passed"), v.literal("failed"), v.literal("skipped")),
  ),
  build: v.optional(
    v.union(v.literal("passed"), v.literal("failed"), v.literal("skipped")),
  ),
});

const statusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("validated"),
  v.literal("pushed"),
  v.literal("failed"),
);

export const create = mutation({
  args: {
    userId: v.id("users"),
    pullRequestId: v.id("pullRequests"),
    approvalId: v.optional(v.id("approvalRequests")),
    headShaAtApproval: v.string(),
    scope: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("fixRuns", {
      userId: args.userId,
      pullRequestId: args.pullRequestId,
      approvalId: args.approvalId,
      headShaAtApproval: args.headShaAtApproval,
      scope: args.scope,
      status: "pending",
      startedAt: Date.now(),
    });
  },
});

export const updateStatus = mutation({
  args: {
    fixRunId: v.id("fixRuns"),
    status: statusValidator,
    validation: v.optional(validationObject),
    commitSha: v.optional(v.string()),
    diffSummary: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { status: args.status };

    if (args.validation !== undefined) {
      patch.validation = args.validation;
    }
    if (args.commitSha !== undefined) {
      patch.commitSha = args.commitSha;
    }
    if (args.diffSummary !== undefined) {
      patch.diffSummary = args.diffSummary;
    }
    if (args.error !== undefined) {
      patch.error = args.error;
    }
    if (
      args.status === "validated" ||
      args.status === "pushed" ||
      args.status === "failed"
    ) {
      patch.completedAt = Date.now();
    }

    await ctx.db.patch(args.fixRunId, patch);
  },
});

export const getById = query({
  args: { fixRunId: v.id("fixRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.fixRunId);
  },
});

export const listByPr = query({
  args: { pullRequestId: v.id("pullRequests") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("fixRuns")
      .withIndex("by_pullRequestId", (q) =>
        q.eq("pullRequestId", args.pullRequestId),
      )
      .collect();
  },
});
