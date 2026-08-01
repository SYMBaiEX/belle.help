import { defineTool } from "eve/tools";
import { z } from "zod";
import { octokitForTenant } from "../lib/github";

export default defineTool({
  description:
    "Inspect CI status for a commit: compact list of check runs and combined commit status, plus the overall combined state.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    ref: z.string().min(1).describe("Commit SHA or branch name"),
  }),
  async execute({ repositoryFullName, ref }, ctx) {
    const { octokit, repo } = await octokitForTenant(ctx, repositoryFullName);

    const [checkRuns, combinedStatus] = await Promise.all([
      octokit.rest.checks.listForRef({ owner: repo.owner, repo: repo.name, ref, per_page: 50 }),
      octokit.rest.repos.getCombinedStatusForRef({ owner: repo.owner, repo: repo.name, ref }),
    ]);

    return {
      repositoryFullName,
      ref,
      combinedState: combinedStatus.data.state,
      checks: checkRuns.data.check_runs.map((c) => ({
        name: c.name,
        status: c.status,
        conclusion: c.conclusion,
        detailsUrl: c.details_url,
        checkRunId: c.id,
      })),
      statuses: combinedStatus.data.statuses.map((s) => ({
        context: s.context,
        state: s.state,
        description: s.description,
        targetUrl: s.target_url,
      })),
    };
  },
});
