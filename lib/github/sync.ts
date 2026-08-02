import { createOctokit } from "@github-tools/sdk";
import { mintInstallationToken } from "@/lib/github-tenant";

/**
 * GitHub App installation sync helpers used by the /api/github/* routes to
 * mirror what a Belle user's GitHub App installation actually grants access
 * to into Convex. Never logs tokens.
 */

export interface InstallationRepository {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string | undefined;
  private: boolean;
}

const PER_PAGE = 100;
const MAX_PAGES = 10;

/**
 * Page through every repository the installation has access to via
 * `GET /installation/repositories`.
 */
export async function listInstallationRepositories(
  installationId: number,
): Promise<InstallationRepository[]> {
  // This module is a library consumed by app/api routes and app/workflows, and
  // its exported signature must not change. The shared helper now returns a
  // discriminated result, so unwrap it here and surface a plain Error — the
  // route/workflow layer above already handles thrown failures.
  const minted = await mintInstallationToken(installationId);
  if (!minted.ok) throw new Error(minted.message);
  const octokit = createOctokit(minted.token);

  const repos: InstallationRepository[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data } = await octokit.request("GET /installation/repositories", {
      per_page: PER_PAGE,
      page,
    });

    for (const repo of data.repositories) {
      repos.push({
        id: repo.id,
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch,
        private: repo.private,
      });
    }

    if (data.repositories.length < PER_PAGE) break;
  }

  return repos;
}

export interface InstallationAccount {
  accountLogin: string;
  accountType: "User" | "Organization";
}

/**
 * Resolve the account (user or org) that owns a GitHub App installation.
 *
 * There is no installation-token-scoped "get this installation" REST
 * endpoint (`GET /app/installations/{id}` requires JWT app auth, which this
 * tenant-scoped code path does not have), so this derives the account from
 * the owner of the installation's first accessible repository instead, and
 * falls back to an honest "unknown" placeholder rather than throwing.
 */
export async function getInstallationAccount(
  installationId: number,
): Promise<InstallationAccount> {
  try {
    const repos = await listInstallationRepositories(installationId);
    const first = repos[0];
    if (first) {
      return { accountLogin: first.owner, accountType: "User" };
    }
  } catch {
    // Fall through to the unknown placeholder.
  }

  return { accountLogin: "unknown", accountType: "User" };
}
