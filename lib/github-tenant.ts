import { createOctokit, type Octokit } from "@github-tools/sdk";
import { getToken } from "@vercel/connect";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { SessionContext } from "eve/context";

/**
 * Tenant-scoped GitHub access, shared by the root agent's GitHub tools (once
 * authored under `agent/tools/`) and every read-only subagent tool under
 * `agent/subagents/*\/tools/`.
 *
 * Lives at repo-root `lib/` — not `agent/lib/` — for two reasons: subagent
 * tool files (which have no access to the agent tree's own `agent/lib/`
 * outside their own subagent directory) can still import it, and it has no
 * dependency back on `agent/lib/*` either. The tiny Convex client below is
 * the same pattern as `agent/lib/convex.ts`'s `db` facade, copied inline
 * rather than imported so this module has zero `agent/` imports in either
 * direction.
 */

let client: ConvexHttpClient | null = null;

function convex(): ConvexHttpClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` locally or configure the production deployment.",
    );
  }
  client = new ConvexHttpClient(url);
  return client;
}

const db = {
  query: async (name: string, args: Record<string, unknown>) => {
    const [mod, fn] = name.split(":");
    const convexClient = convex();
    try {
      return await convexClient.query(anyApi[mod!]![fn!]!, args);
    } catch {
      throw new Error("Convex query failed.");
    }
  },
};

/**
 * Mint a short-lived GitHub App installation token via Vercel Connect.
 *
 * Falls back to `process.env.GITHUB_TOKEN` when Connect itself throws (for
 * example, the connector isn't configured in this environment yet).
 */
export interface GithubTenantFailure {
  ok: false;
  reason: string;
  message: string;
}

export async function mintInstallationToken(
  installationId: number,
): Promise<{ ok: true; token: string } | GithubTenantFailure> {
  try {
    const token = await getToken(process.env.VERCEL_CONNECT_GITHUB_UID ?? "github/belle", {
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

type AuthLike = {
  auth: {
    current: {
      principalType?: string;
      principalId: string;
      attributes: Record<string, unknown>;
    } | null;
  };
};

/**
 * Minimal, agent-tree-independent read of the verified tenant on
 * `ctx.session`. Mirrors `agent/lib/tenant.ts`'s `requireTenantCaller`
 * without importing it, per the isolation goal above.
 */
function tenantUserIdOrError(
  ctx: Pick<SessionContext, "session">,
): { ok: true; userId: string } | GithubTenantFailure {
  const current = (ctx.session as unknown as AuthLike).auth.current;
  const tenantId = current?.attributes.tenantId;
  if (current?.principalType !== "user" || typeof tenantId !== "string") {
    return {
      ok: false,
      reason: "missing_principal",
      message: "I can’t do that because this conversation is not connected to an authenticated Belle user.",
    };
  }
  return { ok: true, userId: tenantId };
}

export interface TenantRepository {
  installationId: number;
  owner: string;
  name: string;
  fullName: string;
}

interface GithubInstallationDoc {
  userId: string;
  installationId: number;
  status: "active" | "revoked";
}

/**
 * Verify the current tenant owns `repositoryFullName` (via
 * `repositories:getByUserAndFullName`) and return its stored record. Returns
 * an expected failure when caller or installation access is unavailable.
 * Callers must never fall back to trusting a
 * model-supplied repository name without this check.
 */
export async function tenantRepository(
  ctx: Pick<SessionContext, "session">,
  repositoryFullName: string,
): Promise<{ ok: true; repository: TenantRepository } | GithubTenantFailure> {
  const tenant = tenantUserIdOrError(ctx);
  if (!tenant.ok) return tenant;
  const { userId } = tenant;
  const repository = (await db.query("repositories:getByUserAndFullName", {
    userId,
    fullName: repositoryFullName,
  })) as { installationId: number; owner: string; name: string; fullName: string } | null;

  if (!repository) {
    return {
      ok: false,
      reason: "repository_not_configured",
      message: `Repository ${repositoryFullName} is not configured for this user.`,
    };
  }

  const installation = (await db.query("githubInstallations:getByInstallationId", {
    installationId: repository.installationId,
  })) as GithubInstallationDoc | null;

  if (!installation || installation.status !== "active" || installation.userId !== userId) {
    return {
      ok: false,
      reason: "github_installation_unavailable",
      message: `The GitHub connection for ${repositoryFullName} is missing or has been revoked.`,
    };
  }

  return {
    ok: true,
    repository: {
      installationId: repository.installationId,
      owner: repository.owner,
      name: repository.name,
      fullName: repository.fullName,
    },
  };
}

/**
 * Verify tenant ownership of `repositoryFullName`, then return an Octokit
 * client authenticated as that repository's GitHub App installation.
 */
export async function octokitForTenant(
  ctx: Pick<SessionContext, "session">,
  repositoryFullName: string,
): Promise<{ ok: true; octokit: Octokit } | GithubTenantFailure> {
  const repositoryResult = await tenantRepository(ctx, repositoryFullName);
  if (!repositoryResult.ok) return repositoryResult;
  const tokenResult = await mintInstallationToken(repositoryResult.repository.installationId);
  if (!tokenResult.ok) return tokenResult;
  return { ok: true, octokit: createOctokit(tokenResult.token) };
}
