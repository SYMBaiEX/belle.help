import { defineTool } from "eve/tools";
import { z } from "zod";

import { mintInstallationToken, tenantRepository } from "../../../../lib/github-tenant";

export default defineTool({
  description:
    "Clone repositoryFullName at branch into the sandbox for an approved fix, and verify the checked-out HEAD matches expectedHeadSha before any file is edited. Aborts if the remote has moved.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1),
    branch: z.string().min(1),
    expectedHeadSha: z.string().min(7),
  }),
  async execute({ repositoryFullName, branch, expectedHeadSha }, ctx) {
    // Verifies tenant ownership of the repo before minting any credential.
    const repository = await tenantRepository(ctx, repositoryFullName);
    const token = await mintInstallationToken(repository.installationId);
    const sandbox = await ctx.getSandbox();

    // Interim credential delivery: the installation token is interpolated
    // directly into the clone command's remote URL and is never written to
    // disk. See ../sandbox/sandbox.ts for the production-path note
    // (firewall credential brokering).
    const cloneUrl = `https://x-access-token:${token}@github.com/${repository.fullName}.git`;
    const clone = await sandbox.run({
      command: `git clone --depth 50 --branch '${branch}' '${cloneUrl}' repo`,
    });
    if (clone.exitCode !== 0) {
      throw new Error(`git clone failed: ${clone.stderr || clone.stdout}`);
    }

    const headResult = await sandbox.run({ command: "git -C repo rev-parse HEAD" });
    const headSha = headResult.stdout.trim();
    if (headSha !== expectedHeadSha) {
      throw new Error(
        `Checked-out HEAD (${headSha}) does not match the approved head SHA ` +
          `(${expectedHeadSha}). The branch moved since approval — abort and report.`,
      );
    }

    await sandbox.run({ command: `git -C repo config user.name "Belle"` });
    await sandbox.run({
      command: `git -C repo config user.email "belle-agent[bot]@users.noreply.github.com"`,
    });

    return { checkedOut: true, headSha };
  },
});
