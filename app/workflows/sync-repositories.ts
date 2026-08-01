import { anyApi } from "convex/server";
import { ConvexHttpClient } from "convex/browser";

import { getInstallationAccount, listInstallationRepositories } from "@/lib/github/sync";

/**
 * Durable repository sync (Vercel Workflow SDK).
 *
 * Syncing a large account is exactly the shape Workflow exists for: it fans
 * out over paginated GitHub calls and then writes to Convex, and any single
 * hop can fail transiently. Run as one plain request it is all-or-nothing and
 * bounded by the invocation lifetime — a 127-repository account already pages
 * GitHub twice before it writes anything.
 *
 * As a workflow, each step is checkpointed and retried independently, and the
 * run survives the serverless invocation that started it.
 *
 * NOTE ON PLACEMENT: workflow directives are only legal in the Next.js tree.
 * eve's build rejects "use workflow"/"use step" inside `agent/**`
 * ("Workflow directives are reserved for eve-generated workflow entrypoints"),
 * so agent-side work cannot be expressed this way. See
 * docs/adr/006-durable-delivery.md.
 */

function convex(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set.");
  return new ConvexHttpClient(url);
}

interface SyncInput {
  userId: string;
  installationId: number;
}

/** Step: resolve the installation's GitHub account. Retried independently. */
async function resolveAccount(installationId: number) {
  "use step";
  return await getInstallationAccount(installationId);
}

/** Step: page GitHub for every repository the installation can reach. */
async function listRepositories(installationId: number) {
  "use step";
  const repos = await listInstallationRepositories(installationId);
  return repos.map((r) => ({
    owner: r.owner,
    name: r.name,
    fullName: r.fullName,
    defaultBranch: r.defaultBranch,
  }));
}

/** Step: record the installation against the Belle user. */
async function recordInstallation(
  input: SyncInput,
  account: { accountLogin: string; accountType: "User" | "Organization" },
) {
  "use step";
  await convex().mutation(anyApi.githubInstallations.upsert, {
    userId: input.userId,
    installationId: input.installationId,
    accountLogin: account.accountLogin,
    accountType: account.accountType,
  });
}

/** Step: reconcile the repository list into Convex, preserving user settings. */
async function persistRepositories(
  input: SyncInput,
  repos: Array<{ owner: string; name: string; fullName: string; defaultBranch?: string }>,
) {
  "use step";
  return (await convex().mutation(anyApi.githubSync.syncRepositories, {
    userId: input.userId,
    installationId: input.installationId,
    repos,
  })) as { added: number; updated: number; total: number };
}

/**
 * Durable entrypoint. Invoking this returns once the run is persisted; the
 * steps then execute durably even if the caller's invocation is torn down.
 */
export async function syncRepositoriesWorkflow(input: SyncInput) {
  "use workflow";

  const account = await resolveAccount(input.installationId);
  await recordInstallation(input, account);
  const repos = await listRepositories(input.installationId);
  return await persistRepositories(input, repos);
}
