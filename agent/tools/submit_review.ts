import { defineTool } from "eve/tools";
import { z } from "zod";
import { decideBelleApproval } from "../lib/approval";
import { recordAudit } from "../lib/convex";
import { octokitForTenant } from "../lib/github";
import { tenantCallerOrError } from "../lib/tenant";

export default defineTool({
  description:
    "Submit a formal pull request review: COMMENT, REQUEST_CHANGES, or APPROVE, with an overall body and optional inline comments. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    prNumber: z.number().int().positive(),
    event: z.enum(["COMMENT", "REQUEST_CHANGES", "APPROVE"]),
    body: z.string(),
    comments: z
      .array(z.object({ path: z.string(), line: z.number().int().positive(), body: z.string() }))
      .optional(),
  }),
  approval: decideBelleApproval,
  async execute({ repositoryFullName, prNumber, event, body, comments }, ctx) {
    const tenant = tenantCallerOrError(ctx);
    if (!tenant.ok) return tenant;
    const { caller } = tenant;
    const github = await octokitForTenant(ctx, repositoryFullName);
    if (!github.ok) return github;
    const { octokit, repo } = github;

    const { data: review } = await octokit.rest.pulls.createReview({
      owner: repo.owner,
      repo: repo.name,
      pull_number: prNumber,
      event,
      body,
      comments: comments?.map((c) => ({ path: c.path, line: c.line, body: c.body })),
    });

    await recordAudit({
      userId: caller.userId,
      actor: "belle",
      action: "submit_review",
      repositoryFullName,
      prNumber,
      detail: event,
      refs: { reviewId: review.id, commentCount: comments?.length ?? 0 },
    });

    return {
      ok: true as const,
      reviewId: review.id,
      state: review.state,
      htmlUrl: review.html_url,
    };
  },
});
