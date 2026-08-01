import { defineTool } from "eve/tools";
import { z } from "zod";

import { octokitForTenant } from "../../../../lib/github-tenant";

export default defineTool({
  description:
    "List jobs for a GitHub Actions workflow run, including which steps failed. Read-only.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1),
    runId: z.number().int().positive(),
  }),
  async execute({ repositoryFullName, runId }, ctx) {
    const octokit = await octokitForTenant(ctx, repositoryFullName);
    const [owner, repo] = repositoryFullName.split("/");

    const { data } = await octokit.request(
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs",
      { owner: owner!, repo: repo!, run_id: runId, per_page: 100 },
    );

    return {
      jobs: data.jobs.map((job) => ({
        id: job.id,
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        htmlUrl: job.html_url,
        failingSteps: (job.steps ?? [])
          .filter((step) => step.conclusion === "failure")
          .map((step) => ({
            name: step.name,
            number: step.number,
            startedAt: step.started_at,
            completedAt: step.completed_at,
          })),
      })),
    };
  },
});
