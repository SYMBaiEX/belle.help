import { getToken } from "@vercel/connect";
import { createOctokit, type Octokit } from "@github-tools/sdk";
import type { SessionContext } from "eve/tools";
import { db } from "./convex";
import { requireTenantCaller } from "./tenant";

/**
 * GitHub access for Belle's tools (ADR 005: Vercel Connect managed GitHub
 * connector is the only integration path — no PATs, no first-party App
 * private key).
 *
 * Tokens are minted per call, never cached or logged, and scoped to the
 * tenant's GitHub App installation.
 */

const CONNECT_CONNECTOR = process.env.VERCEL_CONNECT_GITHUB_UID ?? "github/belle";

/**
 * Mint a short-lived installation token via Vercel Connect.
 *
 * Falls back to `GITHUB_TOKEN` for local dev when Connect is unavailable
 * (no Connect environment configured). Throws a clear error naming both
 * options when neither is usable.
 */
export async function mintInstallationToken(installationId: number): Promise<string> {
  try {
    return await getToken(CONNECT_CONNECTOR, {
      subject: { type: "app" },
      installationId: String(installationId),
    });
  } catch (err) {
    const fallback = process.env.GITHUB_TOKEN;
    if (fallback) return fallback;
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Unable to mint a GitHub installation token via Vercel Connect (connector "${CONNECT_CONNECTOR}"): ${reason}. ` +
        `For local development, set GITHUB_TOKEN instead.`,
    );
  }
}

export interface TenantRepository {
  _id: string;
  userId: string;
  installationId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch?: string;
  autonomyLevel: number;
  watchEnabled: boolean;
  [key: string]: unknown;
}

interface GithubInstallationDoc {
  _id: string;
  userId: string;
  installationId: number;
  accountLogin: string;
  accountType: "User" | "Organization";
  status: "active" | "revoked";
}

/**
 * Resolve the tenant caller from session auth, load their repository config
 * and GitHub installation from Convex, and mint an Octokit client scoped to
 * that installation. Throws when the repo isn't configured for this user or
 * the installation is missing/revoked/owned by another user.
 */
export async function octokitForTenant(
  ctx: Pick<SessionContext, "session">,
  repositoryFullName: string,
): Promise<{ octokit: Octokit; repo: TenantRepository }> {
  const caller = requireTenantCaller(ctx);

  const repo = (await db.query("repositories:getByUserAndFullName", {
    userId: caller.userId,
    fullName: repositoryFullName,
  })) as TenantRepository | null;

  if (!repo) {
    throw new Error(`Repository ${repositoryFullName} is not configured for this user.`);
  }

  const installation = (await db.query("githubInstallations:getByInstallationId", {
    installationId: repo.installationId,
  })) as GithubInstallationDoc | null;

  if (!installation || installation.status !== "active" || installation.userId !== repo.userId) {
    throw new Error(
      `GitHub installation for ${repositoryFullName} is missing, revoked, or does not belong to this user.`,
    );
  }

  const token = await mintInstallationToken(installation.installationId);
  const octokit = createOctokit(token);

  return { octokit, repo };
}
