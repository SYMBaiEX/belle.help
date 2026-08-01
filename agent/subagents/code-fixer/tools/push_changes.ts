import { defineTool } from "eve/tools";
import { z } from "zod";

import { mintInstallationToken, tenantRepository } from "../../../../lib/github-tenant";

export default defineTool({
  description:
    "Stage all changes, commit, and push to branch — never with --force. Verifies the remote head still matches expectedRemoteHeadSha immediately before pushing, and aborts if it has moved.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1),
    branch: z.string().min(1),
    commitMessage: z.string().min(1),
    expectedRemoteHeadSha: z.string().min(7),
  }),
  async execute({ repositoryFullName, branch, commitMessage, expectedRemoteHeadSha }, ctx) {
    const repository = await tenantRepository(ctx, repositoryFullName);
    const sandbox = await ctx.getSandbox();

    const add = await sandbox.run({ command: "git -C repo add -A" });
    if (add.exitCode !== 0) {
      throw new Error(`git add failed: ${add.stderr || add.stdout}`);
    }

    const status = await sandbox.run({ command: "git -C repo status --porcelain" });
    if (status.stdout.trim().length === 0) {
      throw new Error("No changes to commit — refusing to push an empty commit.");
    }

    const commit = await sandbox.run({
      command: `git -C repo commit -m '${commitMessage.replace(/'/g, "'\\''")}'`,
    });
    if (commit.exitCode !== 0) {
      throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
    }

    // Re-mint the token just-in-time; the checkout token may have expired.
    const token = await mintInstallationToken(repository.installationId);

    // Verify the remote hasn't moved past the approved head before pushing.
    const lsRemote = await sandbox.run({
      command: `git -C repo ls-remote 'https://x-access-token:${token}@github.com/${repository.fullName}.git' '${branch}'`,
    });
    const remoteHead = lsRemote.stdout.trim().split(/\s+/)[0];
    if (remoteHead !== expectedRemoteHeadSha) {
      throw new Error(
        `Remote ${branch} head (${remoteHead ?? "unknown"}) no longer matches the expected ` +
          `head (${expectedRemoteHeadSha}). The branch moved after checkout — abort without pushing.`,
      );
    }

    const push = await sandbox.run({
      command: `git -C repo push 'https://x-access-token:${token}@github.com/${repository.fullName}.git' HEAD:'${branch}'`,
    });
    if (push.exitCode !== 0) {
      throw new Error(`git push failed: ${push.stderr || push.stdout}`);
    }

    const revParse = await sandbox.run({ command: "git -C repo rev-parse HEAD" });
    const commitSha = revParse.stdout.trim();

    return { pushed: true, commitSha };
  },
});
