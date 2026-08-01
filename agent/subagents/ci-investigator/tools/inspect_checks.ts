import { defineTool } from "eve/tools";
import { z } from "zod";

import { octokitForTenant } from "../../../../lib/github-tenant";

export default defineTool({
  description:
    "Get GitHub check-runs and the combined commit status for a ref (branch or SHA). Read-only.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1),
    ref: z.string().min(1),
  }),
  async execute({ repositoryFullName, ref }, ctx) {
    const octokit = await octokitForTenant(ctx, repositoryFullName);
    const [owner, repo] = repositoryFullName.split("/");

    const [checkRuns, combinedStatus] = await Promise.all([
      octokit.request("GET /repos/{owner}/{repo}/commits/{ref}/check-runs", {
        owner: owner!,
        repo: repo!,
        ref,
        per_page: 100,
      }),
      octokit.request("GET /repos/{owner}/{repo}/commits/{ref}/status", {
        owner: owner!,
        repo: repo!,
        ref,
      }),
    ]);

    return {
      checkRuns: checkRuns.data.check_runs.map((run) => ({
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        detailsUrl: run.details_url,
        startedAt: run.started_at,
        completedAt: run.completed_at,
      })),
      combinedState: combinedStatus.data.state,
      statuses: combinedStatus.data.statuses.map((status) => ({
        context: status.context,
        state: status.state,
        description: status.description,
        targetUrl: status.target_url,
      })),
    };
  },
});
