import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "../lib/convex";
import { octokitForTenant } from "../lib/github";

export default defineTool({
  description:
    "Composite merge-readiness report for a pull request: state/draft/mergeable status, combined CI checks, review approvals, branch protection required checks (when readable), Belle's latest blocking findings, and allowed merge methods.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    prNumber: z.number().int().positive(),
  }),
  async execute({ repositoryFullName, prNumber }, ctx) {
    const { octokit, repo } = await octokitForTenant(ctx, repositoryFullName);

    const { data: pr } = await octokit.rest.pulls.get({
      owner: repo.owner,
      repo: repo.name,
      pull_number: prNumber,
    });

    const reasons: string[] = [];

    if (pr.draft) reasons.push("PR is a draft.");
    if (pr.state !== "open") reasons.push(`PR state is "${pr.state}", not open.`);
    if (pr.mergeable === false) reasons.push(`Not mergeable (mergeable_state: ${pr.mergeable_state}).`);

    const [combinedStatus, reviewsResp, repoInfo] = await Promise.all([
      octokit.rest.repos.getCombinedStatusForRef({ owner: repo.owner, repo: repo.name, ref: pr.head.sha }),
      octokit.rest.pulls.listReviews({ owner: repo.owner, repo: repo.name, pull_number: prNumber, per_page: 100 }),
      octokit.rest.repos.get({ owner: repo.owner, repo: repo.name }),
    ]);

    if (combinedStatus.data.state === "failure" || combinedStatus.data.state === "error") {
      reasons.push(`CI combined status is "${combinedStatus.data.state}".`);
    }

    // Latest review state per user.
    const latestByUser = new Map<string, string>();
    for (const review of reviewsResp.data) {
      const login = review.user?.login;
      if (!login || !review.submitted_at) continue;
      const prevAt = latestByUser.get(`${login}:at`);
      if (!prevAt || review.submitted_at > prevAt) {
        latestByUser.set(login, review.state);
        latestByUser.set(`${login}:at`, review.submitted_at);
      }
    }
    const approvals = [...latestByUser.entries()].filter(
      ([k, v]) => !k.endsWith(":at") && v === "APPROVED",
    ).length;
    const changesRequested = [...latestByUser.entries()].filter(
      ([k, v]) => !k.endsWith(":at") && v === "CHANGES_REQUESTED",
    ).length;
    if (changesRequested > 0) reasons.push(`${changesRequested} reviewer(s) requested changes.`);

    let branchProtection: { requiredChecks: string[] | "unknown, restricted" } = {
      requiredChecks: "unknown, restricted",
    };
    try {
      const { data: protection } = await octokit.rest.repos.getBranchProtection({
        owner: repo.owner,
        repo: repo.name,
        branch: pr.base.ref,
      });
      branchProtection = {
        requiredChecks: protection.required_status_checks?.contexts ?? [],
      };
    } catch {
      // 403/404: no permission to read branch protection, or none configured.
    }

    let belleBlocking = 0;
    const pullRequestDoc = (await db.query("pullRequests:getByRepoAndNumber", {
      repositoryId: repo._id,
      number: prNumber,
    })) as { _id: string } | null;

    if (pullRequestDoc) {
      const latestRun = (await db.query("reviewRuns:getLatestForPr", {
        pullRequestId: pullRequestDoc._id,
      })) as { _id: string; headSha: string } | null;

      if (latestRun && latestRun.headSha === pr.head.sha) {
        const findings = (await db.query("reviewFindings:listByRun", {
          reviewRunId: latestRun._id,
        })) as Array<{ severity: string; blocksMerge: boolean; dismissedAt?: number }>;
        belleBlocking = findings.filter(
          (f) => f.blocksMerge && f.severity === "blocking" && !f.dismissedAt,
        ).length;
      }
    }
    if (belleBlocking > 0) reasons.push(`${belleBlocking} unresolved Belle blocking finding(s).`);

    const allowedMergeMethods: string[] = [];
    if (repoInfo.data.allow_squash_merge) allowedMergeMethods.push("squash");
    if (repoInfo.data.allow_merge_commit) allowedMergeMethods.push("merge");
    if (repoInfo.data.allow_rebase_merge) allowedMergeMethods.push("rebase");

    return {
      repositoryFullName,
      prNumber,
      headSha: pr.head.sha,
      ready: reasons.length === 0,
      reasons,
      state: pr.state,
      draft: pr.draft ?? false,
      mergeable: pr.mergeable,
      mergeableState: pr.mergeable_state,
      combinedCiState: combinedStatus.data.state,
      approvals,
      changesRequested,
      branchProtection,
      belleBlockingFindings: belleBlocking,
      allowedMergeMethods,
    };
  },
});
