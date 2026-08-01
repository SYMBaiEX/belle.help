import { defineTool } from "eve/tools";
import { z } from "zod";

import { octokitForTenant } from "../../../../lib/github-tenant";

export default defineTool({
  description:
    "Search code in the tenant's repository (GET /search/code), scoped to that repository only via a repo: qualifier. Read-only. Use to trace how a suspicious pattern (a sink, a secret literal, a call site) is used elsewhere in the repo.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1),
    query: z.string().min(1),
  }),
  async execute({ repositoryFullName, query }, ctx) {
    // Verifies tenant ownership before any search is issued.
    const octokit = await octokitForTenant(ctx, repositoryFullName);

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
