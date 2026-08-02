import { defineTool } from "eve/tools";
import { z } from "zod";
import { octokitForTenant } from "../lib/github";

const CONTENT_LIMIT = 20000;

export default defineTool({
  description:
    "Read a file's contents from a repository at a given ref (defaults to the default branch). Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    path: z.string().min(1),
    ref: z.string().optional().describe("Commit SHA, branch, or tag"),
  }),
  async execute({ repositoryFullName, path, ref }, ctx) {
    const github = await octokitForTenant(ctx, repositoryFullName);
    if (!github.ok) return github;
    const { octokit, repo } = github;

    const { data } = await octokit.rest.repos.getContent({
      owner: repo.owner,
      repo: repo.name,
      path,
      ref,
    });

    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
      return {
        ok: false as const,
        reason: "not_a_file",
        message: `${path} is not a file, so I could not read its contents.`,
      };
    }

    const decoded = Buffer.from(data.content, "base64").toString("utf-8");
    const truncated = decoded.length > CONTENT_LIMIT;

    return {
      ok: true as const,
      repositoryFullName,
      path,
      ref: ref ?? repo.defaultBranch,
      sha: data.sha,
      size: data.size,
      content: truncated ? decoded.slice(0, CONTENT_LIMIT) : decoded,
      truncated,
    };
  },
});
