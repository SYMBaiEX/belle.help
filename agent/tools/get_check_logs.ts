import { defineTool } from "eve/tools";
import { z } from "zod";
import { octokitForTenant } from "../lib/github";

export default defineTool({
  description:
    "Get a compact failure summary for a CI run: failing job/step names for a workflow run, or annotations for a specific check run. Does not download full logs.",
  inputSchema: z
    .object({
      repositoryFullName: z.string().min(1).describe("owner/repo"),
      workflowRunId: z.number().int().positive().optional(),
      checkRunId: z.number().int().positive().optional(),
    })
    .refine((v) => v.workflowRunId !== undefined || v.checkRunId !== undefined, {
      message: "Provide workflowRunId or checkRunId.",
    }),
  async execute({ repositoryFullName, workflowRunId, checkRunId }, ctx) {
    const { octokit, repo } = await octokitForTenant(ctx, repositoryFullName);

    const result: {
      repositoryFullName: string;
      failingJobs?: Array<{
        jobName: string;
        failingSteps: Array<{ name: string; conclusion: string | null }>;
        logsUrlAvailable: boolean;
      }>;
      annotations?: Array<{
        path: string;
        startLine: number;
        endLine: number;
        annotationLevel: string | null;
        message: string;
        title: string | null;
      }>;
    } = { repositoryFullName };

    if (workflowRunId !== undefined) {
      const { data: jobs } = await octokit.rest.actions.listJobsForWorkflowRun({
        owner: repo.owner,
        repo: repo.name,
        run_id: workflowRunId,
        per_page: 50,
      });

      result.failingJobs = jobs.jobs
        .filter((j) => j.conclusion === "failure" || j.conclusion === "timed_out" || j.conclusion === "cancelled")
        .map((j) => ({
          jobName: j.name,
          failingSteps: (j.steps ?? [])
            .filter((s) => s.conclusion === "failure" || s.conclusion === "timed_out")
            .map((s) => ({ name: s.name, conclusion: s.conclusion })),
          logsUrlAvailable: Boolean(j.id),
        }));
    }

    if (checkRunId !== undefined) {
      const { data: annotations } = await octokit.rest.checks.listAnnotations({
        owner: repo.owner,
        repo: repo.name,
        check_run_id: checkRunId,
        per_page: 50,
      });

      result.annotations = annotations.map((a) => {
        const message = a.message ?? "";
        return {
          path: a.path,
          startLine: a.start_line,
          endLine: a.end_line,
          annotationLevel: a.annotation_level,
          message: message.length > 1000 ? `${message.slice(0, 1000)}\n…(truncated)` : message,
          title: a.title,
        };
      });
    }

    return result;
  },
});
