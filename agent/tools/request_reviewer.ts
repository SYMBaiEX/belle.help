import { defineTool } from "eve/tools";
import { z } from "zod";
import { decideBelleApproval } from "../lib/approval";
import { recordAudit } from "../lib/convex";
import { octokitForTenant } from "../lib/github";
import { tenantCallerOrError } from "../lib/tenant";

export default defineTool({
  description:
    "Request one or more GitHub users as reviewers on a pull request. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    prNumber: z.number().int().positive(),
    reviewers: z.array(z.string().min(1)).min(1),
  }),
  approval: decideBelleApproval,
  async execute({ repositoryFullName, prNumber, reviewers }, ctx) {
    const tenant = tenantCallerOrError(ctx);
    if (!tenant.ok) return tenant;
    const { caller } = tenant;
    const github = await octokitForTenant(ctx, repositoryFullName);
    if (!github.ok) return github;
    const { octokit, repo } = github;

    const { data: pr } = await octokit.rest.pulls.requestReviewers({
      owner: repo.owner,
      repo: repo.name,
      pull_number: prNumber,
      reviewers,
    });

    await recordAudit({
      userId: caller.userId,
      actor: "belle",
      action: "request_reviewer",
      repositoryFullName,
      prNumber,
      detail: reviewers.join(", "),
    });

    return {
      ok: true as const,
      requestedReviewers: pr.requested_reviewers?.map((r) => r.login) ?? [],
    };
  },
});
