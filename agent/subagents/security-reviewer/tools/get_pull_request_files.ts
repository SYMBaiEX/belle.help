import { defineTool } from "eve/tools";
import { z } from "zod";

import { octokitForTenant } from "../../../../lib/github-tenant";

const MAX_PATCH_CHARS = 6000;
const MAX_PAGES = 10; // hard cap: 1000 files

export default defineTool({
  description:
    "List the files changed in a pull request, with per-file diff patches (truncated). Read-only. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1),
    prNumber: z.number().int().positive(),
  }),
  async execute({ repositoryFullName, prNumber }, ctx) {
    const github = await octokitForTenant(ctx, repositoryFullName);
    // Expected failure returns a value: eve's session.failed is terminal, so a
    // throw here would destroy the user's whole conversation.
    if (!github.ok) return github;
    const { octokit } = github;
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
