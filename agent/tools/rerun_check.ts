import { defineTool } from "eve/tools";
import { z } from "zod";
import { decideBelleApproval } from "../lib/approval";
import { recordAudit } from "../lib/convex";
import { octokitForTenant } from "../lib/github";
import { requireTenantCaller } from "../lib/tenant";

export default defineTool({
  description:
    "Re-run a CI workflow run. Tries to re-run only failed jobs first, falling back to a full re-run if that isn't possible.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    workflowRunId: z.number().int().positive(),
  }),
  approval: decideBelleApproval,
  async execute({ repositoryFullName, workflowRunId }, ctx) {
    const caller = requireTenantCaller(ctx);
    const { octokit, repo } = await octokitForTenant(ctx, repositoryFullName);

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

    return { workflowRunId, mode };
  },
});
