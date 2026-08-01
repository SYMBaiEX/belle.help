import { defineTool } from "eve/tools";
import { z } from "zod";
import { decideBelleApproval } from "../lib/approval";
import { recordAudit } from "../lib/convex";
import { octokitForTenant } from "../lib/github";
import { requireTenantCaller } from "../lib/tenant";

export default defineTool({
  description: "Add one or more labels to a pull request.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    prNumber: z.number().int().positive(),
    labels: z.array(z.string().min(1)).min(1),
  }),
  approval: decideBelleApproval,
  async execute({ repositoryFullName, prNumber, labels }, ctx) {
    const caller = requireTenantCaller(ctx);
    const { octokit, repo } = await octokitForTenant(ctx, repositoryFullName);

    const { data } = await octokit.rest.issues.addLabels({
      owner: repo.owner,
      repo: repo.name,
      issue_number: prNumber,
      labels,
    });

    await recordAudit({
      userId: caller.userId,
      actor: "belle",
      action: "add_label",
      repositoryFullName,
      prNumber,
      detail: labels.join(", "),
    });

    return { labels: data.map((l) => l.name) };
  },
});
