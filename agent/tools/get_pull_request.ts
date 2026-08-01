import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "../lib/convex";
import { octokitForTenant } from "../lib/github";
import { requireTenantCaller } from "../lib/tenant";

function truncate(text: string | null | undefined, max: number): string | undefined {
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max)}\n…(truncated)` : text;
}

export default defineTool({
  description:
    "Fetch a pull request's details from GitHub (title, body, state, diffstat, mergeability, labels, author). Also records it in Convex and sets it as the active PR for this conversation.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    prNumber: z.number().int().positive(),
  }),
  async execute({ repositoryFullName, prNumber }, ctx) {
    const caller = requireTenantCaller(ctx);
    const { octokit, repo } = await octokitForTenant(ctx, repositoryFullName);

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
