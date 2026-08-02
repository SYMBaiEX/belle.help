import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "../lib/convex";
import { octokitForTenant } from "../lib/github";
import { tenantCallerOrError } from "../lib/tenant";

function truncate(text: string | null | undefined, max: number): string | undefined {
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max)}\n…(truncated)` : text;
}

export default defineTool({
  description:
    "Fetch a pull request's details from GitHub (title, body, state, diffstat, mergeability, labels, author). Also records it in Convex and sets it as the active PR for this conversation. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    prNumber: z.number().int().positive(),
  }),
  async execute({ repositoryFullName, prNumber }, ctx) {
    const tenant = tenantCallerOrError(ctx);
    if (!tenant.ok) return tenant;
    const { caller } = tenant;
    const github = await octokitForTenant(ctx, repositoryFullName);
    if (!github.ok) return github;
    const { octokit, repo } = github;

    const { data: pr } = await octokit.rest.pulls.get({
      owner: repo.owner,
      repo: repo.name,
      pull_number: prNumber,
    });

    await db.mutation("pullRequests:upsert", {
      userId: caller.userId,
      repositoryId: repo._id,
      number: pr.number,
      title: pr.title,
      authorLogin: pr.user?.login ?? "unknown",
      state: pr.draft ? "draft" : pr.merged ? "merged" : pr.state === "closed" ? "closed" : "open",
      headSha: pr.head.sha,
      baseRef: pr.base.ref,
      headRef: pr.head.ref,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
      url: pr.html_url,
    });

    await db.mutation("conversationContexts:setActivePr", {
      userId: caller.userId,
      repositoryFullName,
      prNumber,
      headSha: pr.head.sha,
    });

    return {
      ok: true as const,
      repositoryFullName,
      prNumber: pr.number,
      title: pr.title,
      body: truncate(pr.body, 2000),
      state: pr.state,
      draft: pr.draft ?? false,
      headSha: pr.head.sha,
      baseRef: pr.base.ref,
      headRef: pr.head.ref,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
      mergeable: pr.mergeable,
      mergeableState: pr.mergeable_state,
      labels: pr.labels.map((l) => (typeof l === "string" ? l : l.name)),
      author: pr.user?.login,
      url: pr.html_url,
    };
  },
});
