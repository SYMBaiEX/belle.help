import { defineTool } from "eve/tools";
import { z } from "zod";

import { octokitForTenant } from "../../../../lib/github-tenant";

const MAX_PATCH_CHARS = 6000;
const MAX_PAGES = 10; // hard cap: 1000 files

export default defineTool({
  description:
    "List the files changed in a pull request, with per-file diff patches (truncated). Read-only.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1),
    prNumber: z.number().int().positive(),
  }),
  async execute({ repositoryFullName, prNumber }, ctx) {
    const octokit = await octokitForTenant(ctx, repositoryFullName);
    const [owner, repo] = repositoryFullName.split("/");

    const files: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      changes: number;
      patch?: string;
    }> = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { data } = await octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
        { owner: owner!, repo: repo!, pull_number: prNumber, per_page: 100, page },
      );

      for (const file of data) {
        const patch = file.patch;
        files.push({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          patch:
            patch && patch.length > MAX_PATCH_CHARS
              ? `${patch.slice(0, MAX_PATCH_CHARS)}\n… [truncated ${patch.length - MAX_PATCH_CHARS} chars]`
              : patch,
        });
      }

      if (data.length < 100) break;
    }

    return { files, totalFiles: files.length };
  },
});
