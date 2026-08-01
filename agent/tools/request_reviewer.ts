import { defineTool } from "eve/tools";
import { z } from "zod";
import { decideBelleApproval } from "../lib/approval";
import { recordAudit } from "../lib/convex";
import { octokitForTenant } from "../lib/github";
import { requireTenantCaller } from "../lib/tenant";

export default defineTool({
  description: "Request one or more GitHub users as reviewers on a pull request.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    prNumber: z.number().int().positive(),
    reviewers: z.array(z.string().min(1)).min(1),
  }),
  approval: decideBelleApproval,
  async execute({ repositoryFullName, prNumber, reviewers }, ctx) {
    const caller = requireTenantCaller(ctx);
    const { octokit, repo } = await octokitForTenant(ctx, repositoryFullName);

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
      requestedReviewers: pr.requested_reviewers?.map((r) => r.login) ?? [],
    };
  },
});
