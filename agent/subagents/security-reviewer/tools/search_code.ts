import { defineTool } from "eve/tools";
import { z } from "zod";

import { octokitForTenant } from "../../../../lib/github-tenant";

export default defineTool({
  description:
    "Search code in the tenant's repository (GET /search/code), scoped to that repository only via a repo: qualifier. Read-only. Use to trace how a suspicious pattern (a sink, a secret literal, a call site) is used elsewhere in the repo. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1),
    query: z.string().min(1),
  }),
  async execute({ repositoryFullName, query }, ctx) {
    // Verifies tenant ownership before any search is issued.
    const github = await octokitForTenant(ctx, repositoryFullName);
    // Expected failure returns a value: eve's session.failed is terminal, so a
    // throw here would destroy the user's whole conversation.
    if (!github.ok) return github;
    const { octokit } = github;

    const { data } = await octokit.request("GET /search/code", {
      q: `${query} repo:${repositoryFullName}`,
      per_page: 30,
    });

    return {
      totalCount: data.total_count,
      incomplete: data.incomplete_results,
      items: data.items.map((item) => ({
        path: item.path,
        sha: item.sha,
        url: item.html_url,
        repository: item.repository?.full_name,
      })),
    };
  },
});
