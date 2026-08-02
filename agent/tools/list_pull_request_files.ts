import { defineTool } from "eve/tools";
import { z } from "zod";
import { octokitForTenant } from "../lib/github";

const PATCH_LIMIT = 4000;

export default defineTool({
  description:
    "List the files changed in a pull request, with per-file diff patches (truncated to keep output small). Paginated at 30 files per page. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    prNumber: z.number().int().positive(),
    page: z.number().int().positive().optional(),
  }),
  async execute({ repositoryFullName, prNumber, page }, ctx) {
    const github = await octokitForTenant(ctx, repositoryFullName);
    if (!github.ok) return github;
    const { octokit, repo } = github;

    const { data: files } = await octokit.rest.pulls.listFiles({
      owner: repo.owner,
      repo: repo.name,
      pull_number: prNumber,
      per_page: 30,
      page: page ?? 1,
    });

    return {
      ok: true as const,
      repositoryFullName,
      prNumber,
      page: page ?? 1,
      files: files.map((f) => {
        const truncated = Boolean(f.patch && f.patch.length > PATCH_LIMIT);
        return {
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ? f.patch.slice(0, PATCH_LIMIT) : undefined,
          patchTruncated: truncated,
        };
      }),
    };
  },
});
