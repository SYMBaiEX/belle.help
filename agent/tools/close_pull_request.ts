import { defineTool } from "eve/tools";
import { z } from "zod";
import { consumeProductApproval, decideBelleApproval } from "../lib/approval";
import { db, recordAudit } from "../lib/convex";
import { octokitForTenant } from "../lib/github";
import { tenantCallerOrError } from "../lib/tenant";

export default defineTool({
  description:
    "Close a pull request without merging. HIGH CONSEQUENCE: before calling this, create an approval request with create_approval_request, present the prompt to the user, wait for them to approve via resolve_approval, then call this tool with the approvalId. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    prNumber: z.number().int().positive(),
    approvalId: z.string().min(1),
  }),
  approval: decideBelleApproval,
  async execute({ repositoryFullName, prNumber, approvalId }, ctx) {
    const tenant = tenantCallerOrError(ctx);
    if (!tenant.ok) return tenant;
    const { caller } = tenant;

    const approval = await consumeProductApproval({
      approvalId,
      userId: caller.userId,
      action: "close_pull_request",
      repositoryFullName,
      prNumber,
    });
    // Safety stop: invalid approval must return before the pull request is closed.
    if (!approval.ok) return approval;

    const github = await octokitForTenant(ctx, repositoryFullName);
    if (!github.ok) return github;
    const { octokit, repo } = github;

    const { data: pr } = await octokit.rest.pulls.update({
      owner: repo.owner,
      repo: repo.name,
      pull_number: prNumber,
      state: "closed",
    });

    const pullRequestDoc = (await db.query("pullRequests:getByRepoAndNumber", {
      repositoryId: repo._id,
      number: prNumber,
    })) as { _id: string } | null;

    if (pullRequestDoc) {
      await db.mutation("pullRequests:upsert", {
        userId: caller.userId,
        repositoryId: repo._id,
        number: prNumber,
        title: pr.title,
        authorLogin: pr.user?.login ?? "unknown",
        state: "closed",
        headSha: pr.head.sha,
        baseRef: pr.base.ref,
        headRef: pr.head.ref,
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changed_files,
        url: pr.html_url,
      });
    }

    await recordAudit({
      userId: caller.userId,
      actor: "belle",
      action: "close_pull_request",
      repositoryFullName,
      prNumber,
      refs: { approvalId },
    });

    return { ok: true as const, closed: true };
  },
});
