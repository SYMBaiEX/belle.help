import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "../lib/convex";
import { requireTenantCaller } from "../lib/tenant";

const validationSchema = z.object({
  typecheck: z.enum(["passed", "failed", "skipped"]).optional(),
  tests: z.enum(["passed", "failed", "skipped"]).optional(),
  build: z.enum(["passed", "failed", "skipped"]).optional(),
});

export default defineTool({
  description:
    "Record or update a fix-run: an automated code-fix attempt Belle made on a pull request. Pass fixRunId to update an existing run (e.g. after validation completes), or omit it to start a new one.",
  inputSchema: z.object({
    fixRunId: z.string().optional(),
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    prNumber: z.number().int().positive(),
    approvalId: z.string().optional(),
    headShaAtApproval: z.string().min(1),
    scope: z.string().min(1),
    status: z.enum(["pending", "running", "validated", "pushed", "failed"]),
    validation: validationSchema.optional(),
    commitSha: z.string().optional(),
    diffSummary: z.string().optional(),
    error: z.string().optional(),
  }),
  async execute(
    {
      fixRunId,
      repositoryFullName,
      prNumber,
      approvalId,
      headShaAtApproval,
      scope,
      status,
      validation,
      commitSha,
      diffSummary,
      error,
    },
    ctx,
  ) {
    const caller = requireTenantCaller(ctx);

    let id = fixRunId;

    if (!id) {
      const repo = (await db.query("repositories:getByUserAndFullName", {
        userId: caller.userId,
        fullName: repositoryFullName,
      })) as { _id: string } | null;
      if (!repo) {
        throw new Error(`Repository ${repositoryFullName} is not configured for this user.`);
      }

      const pullRequestDoc = (await db.query("pullRequests:getByRepoAndNumber", {
        repositoryId: repo._id,
        number: prNumber,
      })) as { _id: string } | null;
      if (!pullRequestDoc) {
        throw new Error(
          `Pull request ${repositoryFullName}#${prNumber} is not recorded yet — call get_pull_request first.`,
        );
      }

      id = (await db.mutation("fixRuns:create", {
        userId: caller.userId,
        pullRequestId: pullRequestDoc._id,
        approvalId,
        headShaAtApproval,
        scope,
      })) as string;
    }

    await db.mutation("fixRuns:updateStatus", {
      fixRunId: id,
      status,
      validation,
      commitSha,
      diffSummary,
      error,
    });

    return { fixRunId: id };
  },
});
