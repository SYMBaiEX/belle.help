import { defineTool } from "eve/tools";
import { z } from "zod";
import { budgetList, capText } from "../lib/budget";
import { octokitForTenant } from "../lib/github";

/** Longest single annotation message worth inlining. */
const ANNOTATION_LIMIT = 800;
/** Total characters of annotation text one call may return (~3k tokens). */
const ANNOTATION_BUDGET = 12_000;

export default defineTool({
  description:
    "Get a compact failure summary for a CI run: failing job/step names for a workflow run, or annotations for a specific check run. Does not download full logs. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
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
    const github = await octokitForTenant(ctx, repositoryFullName);
    if (!github.ok) return github;
    const { octokit, repo } = github;

    const result: {
      repositoryFullName: string;
      annotationsOmitted?: number;
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

      // 50 annotations at 1,000 characters each authorized ~12,500 tokens from
      // one call, and failures repeat the same message across many lines. Spend
      // a shared budget instead: the first failures are the ones that explain
      // the build, and `annotationsOmitted` tells the model what it is missing.
      const budgeted = budgetList(
        annotations,
        (a) => Math.min((a.message ?? "").length, ANNOTATION_LIMIT) + 120,
        ANNOTATION_BUDGET,
      );

      result.annotationsOmitted = budgeted.omitted;
      result.annotations = budgeted.items.map((a) => {
        const message = capText(a.message ?? "", ANNOTATION_LIMIT);
        return {
          path: a.path,
          startLine: a.start_line,
          endLine: a.end_line,
          annotationLevel: a.annotation_level,
          message: message.text,
          title: a.title,
        };
      });
    }

    return { ok: true as const, ...result };
  },
});
