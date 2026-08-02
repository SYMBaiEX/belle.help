import { defineTool } from "eve/tools";
import { z } from "zod";
import { decideBelleApproval } from "../lib/approval";
import { recordAudit } from "../lib/convex";
import { octokitForTenant } from "../lib/github";
import { tenantCallerOrError } from "../lib/tenant";

export default defineTool({
  description:
    "Re-run a CI workflow run. Tries to re-run only failed jobs first, falling back to a full re-run if that isn't possible. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    workflowRunId: z.number().int().positive(),
  }),
  approval: decideBelleApproval,
  async execute({ repositoryFullName, workflowRunId }, ctx) {
    const tenant = tenantCallerOrError(ctx);
    if (!tenant.ok) return tenant;
    const { caller } = tenant;
    const github = await octokitForTenant(ctx, repositoryFullName);
    if (!github.ok) return github;
    const { octokit, repo } = github;

    let mode: "failed-jobs" | "full";
    try {
      await octokit.rest.actions.reRunWorkflowFailedJobs({
        owner: repo.owner,
        repo: repo.name,
        run_id: workflowRunId,
      });
      mode = "failed-jobs";
    } catch {
      await octokit.rest.actions.reRunWorkflow({
        owner: repo.owner,
        repo: repo.name,
        run_id: workflowRunId,
      });
      mode = "full";
    }

    await recordAudit({
      userId: caller.userId,
      actor: "belle",
      action: "rerun_check",
      repositoryFullName,
      detail: `workflowRunId=${workflowRunId} mode=${mode}`,
    });

    return { ok: true as const, workflowRunId, mode };
  },
});
