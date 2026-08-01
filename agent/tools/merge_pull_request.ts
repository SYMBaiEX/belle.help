import { defineTool } from "eve/tools";
import { z } from "zod";
import { consumeProductApproval, decideBelleApproval } from "../lib/approval";
import { db, recordAudit } from "../lib/convex";
import { octokitForTenant } from "../lib/github";
import { requireTenantCaller } from "../lib/tenant";

export default defineTool({
  description:
    "Merge a pull request. HIGH CONSEQUENCE and irreversible-ish: before calling this, create an approval request with create_approval_request, present the prompt to the user, wait for them to approve via resolve_approval, then call this tool with the approvalId. The head SHA is re-verified against `expectedHeadSha` at merge time — if the PR moved since approval, the merge is aborted.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    prNumber: z.number().int().positive(),
    method: z.enum(["merge", "squash", "rebase"]),
    expectedHeadSha: z.string().min(1),
    approvalId: z.string().min(1),
  }),
  approval: decideBelleApproval,
  async execute({ repositoryFullName, prNumber, method, expectedHeadSha, approvalId }, ctx) {
    const caller = requireTenantCaller(ctx);

    await consumeProductApproval({
      approvalId,
      userId: caller.userId,
      action: "merge_pull_request",
      repositoryFullName,
      prNumber,
      expectedHeadSha,
    });

    const { octokit, repo } = await octokitForTenant(ctx, repositoryFullName);

    const { data: pr } = await octokit.rest.pulls.get({
      owner: repo.owner,
      repo: repo.name,
      pull_number: prNumber,
    });

    if (pr.head.sha !== expectedHeadSha) {
      throw new Error("Head SHA changed since approval — merge aborted.");
    }

    const { data: mergeResult } = await octokit.rest.pulls.merge({
      owner: repo.owner,
      repo: repo.name,
      pull_number: prNumber,
      sha: expectedHeadSha,
      merge_method: method,
    });

    if (!mergeResult.merged) {
      throw new Error(mergeResult.message ?? "GitHub reported the merge did not succeed.");
    }

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
        state: "merged",
        headSha: mergeResult.sha,
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
      action: "merge_pull_request",
      repositoryFullName,
      prNumber,
      detail: `method=${method} sha=${mergeResult.sha}`,
      refs: { approvalId },
    });

    return { merged: true, sha: mergeResult.sha };
  },
});
