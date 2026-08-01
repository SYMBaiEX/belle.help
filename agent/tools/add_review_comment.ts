import { defineTool } from "eve/tools";
import { z } from "zod";
import { decideBelleApproval } from "../lib/approval";
import { recordAudit } from "../lib/convex";
import { octokitForTenant } from "../lib/github";
import { requireTenantCaller } from "../lib/tenant";

export default defineTool({
  description:
    "Add a comment to a pull request. Pass `path` and `line` to leave an inline code comment on the current head commit; omit them to post a general issue-style comment.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    prNumber: z.number().int().positive(),
    body: z.string().min(1),
    path: z.string().optional(),
    line: z.number().int().positive().optional(),
    side: z.enum(["LEFT", "RIGHT"]).optional(),
  }),
  approval: decideBelleApproval,
  async execute({ repositoryFullName, prNumber, body, path, line, side }, ctx) {
    const caller = requireTenantCaller(ctx);
    const { octokit, repo } = await octokitForTenant(ctx, repositoryFullName);

    let commentUrl: string;
    let commentId: number;

    if (path && line !== undefined) {
      const { data: pr } = await octokit.rest.pulls.get({
        owner: repo.owner,
        repo: repo.name,
        pull_number: prNumber,
      });
      const { data: comment } = await octokit.rest.pulls.createReviewComment({
        owner: repo.owner,
        repo: repo.name,
        pull_number: prNumber,
        body,
        commit_id: pr.head.sha,
        path,
        line,
        side: side ?? "RIGHT",
      });
      commentUrl = comment.html_url;
      commentId = comment.id;
    } else {
      const { data: comment } = await octokit.rest.issues.createComment({
        owner: repo.owner,
        repo: repo.name,
        issue_number: prNumber,
        body,
      });
      commentUrl = comment.html_url;
      commentId = comment.id;
    }

    await recordAudit({
      userId: caller.userId,
      actor: "belle",
      action: "add_review_comment",
      repositoryFullName,
      prNumber,
      detail: path ? `inline comment on ${path}:${line}` : "issue comment",
      refs: { commentId, commentUrl },
    });

    return { commentId, commentUrl };
  },
});
