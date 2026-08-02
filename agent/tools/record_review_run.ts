import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "../lib/convex";
import { tenantCallerOrError } from "../lib/tenant";

const findingSchema = z.object({
  severity: z.enum(["blocking", "important", "suggestion"]),
  confidence: z.enum(["high", "medium", "low"]),
  file: z.string().min(1),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  title: z.string().min(1),
  explanation: z.string().min(1),
  impact: z.string().optional(),
  evidence: z.string().optional(),
  suggestedResolution: z.string().optional(),
  blocksMerge: z.boolean(),
});

export default defineTool({
  description:
    "Record the results of a code review pass on a pull request: a summary and structured findings. Creates a reviewRun and its findings in Convex. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    prNumber: z.number().int().positive(),
    headSha: z.string().min(1),
    summary: z.string().min(1),
    findings: z.array(findingSchema),
  }),
  async execute({ repositoryFullName, prNumber, headSha, summary, findings }, ctx) {
    const tenant = tenantCallerOrError(ctx);
    if (!tenant.ok) return tenant;
    const { caller } = tenant;

    const repo = (await db.query("repositories:getByUserAndFullName", {
      userId: caller.userId,
      fullName: repositoryFullName,
    })) as { _id: string } | null;
    if (!repo) {
      return {
        ok: false as const,
        reason: "repository_not_configured",
        message: `Repository ${repositoryFullName} is not configured for this user.`,
      };
    }

    const pullRequestDoc = (await db.query("pullRequests:getByRepoAndNumber", {
      repositoryId: repo._id,
      number: prNumber,
    })) as { _id: string } | null;
    if (!pullRequestDoc) {
      return {
        ok: false as const,
        reason: "pull_request_not_recorded",
        message: `Pull request ${repositoryFullName}#${prNumber} is not recorded yet, so I need to fetch it first.`,
      };
    }

    const reviewRunId = (await db.mutation("reviewRuns:create", {
      userId: caller.userId,
      pullRequestId: pullRequestDoc._id,
      headSha,
    })) as string;

    if (findings.length > 0) {
      await db.mutation("reviewFindings:createMany", {
        findings: findings.map((f) => ({
          userId: caller.userId,
          reviewRunId,
          severity: f.severity,
          confidence: f.confidence,
          file: f.file,
          startLine: f.startLine,
          endLine: f.endLine,
          title: f.title,
          explanation: f.explanation,
          impact: f.impact,
          evidence: f.evidence,
          suggestedResolution: f.suggestedResolution,
          blocksMerge: f.blocksMerge,
          publishedToGitHub: false,
        })),
      });
    }

    const counts = {
      blocking: findings.filter((f) => f.severity === "blocking").length,
      important: findings.filter((f) => f.severity === "important").length,
      suggestion: findings.filter((f) => f.severity === "suggestion").length,
    };

    await db.mutation("reviewRuns:complete", {
      reviewRunId,
      summary,
      blockingCount: counts.blocking,
      importantCount: counts.important,
      suggestionCount: counts.suggestion,
    });

    if (ctx.session.id) {
      await db.mutation("pullRequests:setSession", {
        pullRequestId: pullRequestDoc._id,
        eveSessionId: ctx.session.id,
      });
    }

    return {
      ok: true as const,
      reviewRunId,
      counts,
      dashboardPath: `/dashboard/reviews/${reviewRunId}`,
    };
  },
});
