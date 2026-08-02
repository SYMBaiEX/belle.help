import { defineTool } from "eve/tools";
import { z } from "zod";
import { decideBelleApproval } from "../lib/approval";
import { recordAudit } from "../lib/convex";
import { octokitForTenant } from "../lib/github";
import { tenantCallerOrError } from "../lib/tenant";

export default defineTool({
  description:
    "Add one or more labels to a pull request. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    prNumber: z.number().int().positive(),
    labels: z.array(z.string().min(1)).min(1),
  }),
  approval: decideBelleApproval,
  async execute({ repositoryFullName, prNumber, labels }, ctx) {
    const tenant = tenantCallerOrError(ctx);
    if (!tenant.ok) return tenant;
    const { caller } = tenant;
    const github = await octokitForTenant(ctx, repositoryFullName);
    if (!github.ok) return github;
    const { octokit, repo } = github;

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

    return { ok: true as const, labels: data.map((l) => l.name) };
  },
});
