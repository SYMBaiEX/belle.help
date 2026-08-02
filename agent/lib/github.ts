import { getToken } from "@vercel/connect";
import { createOctokit, type Octokit } from "@github-tools/sdk";
import type { SessionContext } from "eve/tools";
import { db } from "./convex";
import { tenantCallerOrError, type ToolFailure } from "./tenant";

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
 * (no Connect environment configured). Returns a tool-safe failure when
 * neither option is usable.
 */
export async function mintInstallationToken(
  installationId: number,
): Promise<{ ok: true; token: string } | ToolFailure> {
  try {
    const token = await getToken(CONNECT_CONNECTOR, {
      subject: { type: "app" },
      installationId: String(installationId),
    });
    return { ok: true, token };
  } catch {
    const fallback = process.env.GITHUB_TOKEN;
    if (fallback) return { ok: true, token: fallback };
    return {
      ok: false,
      reason: "github_token_unavailable",
      message: "GitHub access is temporarily unavailable, so I could not complete that request.",
    };
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
 * that installation. Expected access failures are returned for tools to relay.
 */
export async function octokitForTenant(
  ctx: Pick<SessionContext, "session">,
  repositoryFullName: string,
): Promise<{ ok: true; octokit: Octokit; repo: TenantRepository } | ToolFailure> {
  const tenant = tenantCallerOrError(ctx);
  if (!tenant.ok) return tenant;
  const { caller } = tenant;

  const repo = (await db.query("repositories:getByUserAndFullName", {
    userId: caller.userId,
    fullName: repositoryFullName,
  })) as TenantRepository | null;

  if (!repo) {
    return {
      ok: false,
      reason: "repository_not_configured",
      message: `Repository ${repositoryFullName} is not configured for this user.`,
    };
  }

  const installation = (await db.query("githubInstallations:getByInstallationId", {
    installationId: repo.installationId,
  })) as GithubInstallationDoc | null;

  if (!installation || installation.status !== "active" || installation.userId !== repo.userId) {
    return {
      ok: false,
      reason: "github_installation_unavailable",
      message: `The GitHub connection for ${repositoryFullName} is missing or has been revoked.`,
    };
  }

  const tokenResult = await mintInstallationToken(installation.installationId);
  if (!tokenResult.ok) return tokenResult;
  const octokit = createOctokit(tokenResult.token);

  return { ok: true, octokit, repo };
}
