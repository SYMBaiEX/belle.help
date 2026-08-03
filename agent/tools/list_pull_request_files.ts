import { defineTool } from "eve/tools";
import { z } from "zod";
import { budgetList, capText } from "../lib/budget";
import { octokitForTenant } from "../lib/github";

/** Largest single patch worth inlining; bigger diffs get read file by file. */
const PATCH_LIMIT = 4000;

/**
 * Total characters of diff this call may return.
 *
 * The previous per-file limit of 4,000 was applied to each of 30 files, which
 * authorized 120,000 characters — about 30,000 tokens — from one call, and that
 * result then rode along in the transcript for the rest of the conversation.
 * The budget is what actually bounds the cost; the per-file limit only stops
 * one enormous file from consuming all of it.
 */
const PATCH_BUDGET = 20_000;

export default defineTool({
  description:
    "List the files changed in a pull request. Always returns the full file list for the page (name, status, +/- counts) and inlines as many diff patches as fit in a size budget, closest to the top first. When patchesOmitted is above zero, the remaining files are still listed — read the ones you care about with get_file_contents rather than paging for more patches. Paginated at 30 files per page. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
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

    // Spend the patch budget over the files in order. File metadata is cheap
    // and always included, so the model keeps a complete picture of the change
    // even when most patches do not fit.
    const patches = budgetList(
      files.filter((f) => Boolean(f.patch)),
      (f) => Math.min(f.patch!.length, PATCH_LIMIT),
      PATCH_BUDGET,
    );
    const withPatch = new Set(patches.items.map((f) => f.filename));

    return {
      ok: true as const,
      repositoryFullName,
      prNumber,
      page: page ?? 1,
      patchesOmitted: patches.omitted,
      files: files.map((f) => {
        const inlined = withPatch.has(f.filename) && f.patch;
        const patch = inlined ? capText(f.patch!, PATCH_LIMIT) : null;
        return {
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          ...(patch
            ? { patch: patch.text, patchTruncated: patch.truncated }
            : { patchOmitted: true as const }),
        };
      }),
    };
  },
});
