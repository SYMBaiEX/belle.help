import { defineTool } from "eve/tools";
import { z } from "zod";

import { octokitForTenant } from "../../../../lib/github-tenant";

const MAX_CHARS = 20_000;

export default defineTool({
  description:
    "Read a file's contents at a given ref (branch, tag, or SHA), truncated to 20k characters. Read-only. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1),
    path: z.string().min(1),
    ref: z.string().min(1),
  }),
  async execute({ repositoryFullName, path, ref }, ctx) {
    const github = await octokitForTenant(ctx, repositoryFullName);
    // Expected failure returns a value: eve's session.failed is terminal, so a
    // throw here would destroy the user's whole conversation.
    if (!github.ok) return github;
    const { octokit } = github;
    const [owner, repo] = repositoryFullName.split("/");

    const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner: owner!,
      repo: repo!,
      path,
      ref,
    });

    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
      return {
        ok: false as const,
        reason: "not_a_file",
        message: `"${path}" at ${ref} is not a readable file — it looks like a directory or a non-file entry.`,
      };
    }

    const content = Buffer.from(data.content, (data.encoding as BufferEncoding) ?? "base64").toString(
      "utf8",
    );
    const truncated = content.length > MAX_CHARS;

    return {
      path,
      ref,
      truncated,
      content: truncated ? content.slice(0, MAX_CHARS) : content,
    };
  },
});
