import { defineTool } from "eve/tools";
import { z } from "zod";

import { octokitForTenant } from "../../../../lib/github-tenant";

const MAX_CHARS = 20_000;

export default defineTool({
  description:
    "Read a file's contents at a given ref (branch, tag, or SHA), truncated to 20k characters. Read-only.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1),
    path: z.string().min(1),
    ref: z.string().min(1),
  }),
  async execute({ repositoryFullName, path, ref }, ctx) {
    const octokit = await octokitForTenant(ctx, repositoryFullName);
    const [owner, repo] = repositoryFullName.split("/");

    const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner: owner!,
      repo: repo!,
      path,
      ref,
    });

    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
      throw new Error(`"${path}" at ${ref} is not a readable file (directory or non-file entry).`);
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
