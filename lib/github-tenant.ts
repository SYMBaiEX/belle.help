import { Octokit } from "@github-tools/sdk";
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
  query: (name: string, args: Record<string, unknown>) => {
    const [mod, fn] = name.split(":");
    return convex().query(anyApi[mod!]![fn!]!, args);
  },
};

/**
 * Mint a short-lived GitHub App installation token via Vercel Connect.
 *
 * Falls back to `process.env.GITHUB_TOKEN` when Connect itself throws (for
 * example, the connector isn't configured in this environment yet).
 */
export async function mintInstallationToken(installationId: number): Promise<string> {
  try {
    return await getToken(process.env.VERCEL_CONNECT_GITHUB_UID ?? "github/belle", {
      subject: { type: "app" },
      installationId: String(installationId),
    });
  } catch (error) {
    const fallback = process.env.GITHUB_TOKEN;
    if (fallback) return fallback;
    throw error;
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
function requireTenantUserId(ctx: Pick<SessionContext, "session">): string {
  const current = (ctx.session as unknown as AuthLike).auth.current;
  const tenantId = current?.attributes.tenantId;
  if (current?.principalType !== "user" || typeof tenantId !== "string") {
    throw new Error("An authenticated Belle user is required for this action.");
  }
  return tenantId;
}

export interface TenantRepository {
  installationId: number;
  owner: string;
  name: string;
  fullName: string;
}

/**
 * Verify the current tenant owns `repositoryFullName` (via
 * `repositories:getByUserAndFullName`) and return its stored record. Throws
 * when the caller is unauthenticated or the repository is not in that
 * user's configured selection — callers must never fall back to trusting a
 * model-supplied repository name without this check.
 */
export async function tenantRepository(
  ctx: Pick<SessionContext, "session">,
  repositoryFullName: string,
): Promise<TenantRepository> {
  const userId = requireTenantUserId(ctx);
  const repository = (await db.query("repositories:getByUserAndFullName", {
    userId,
    fullName: repositoryFullName,
  })) as { installationId: number; owner: string; name: string; fullName: string } | null;

  if (!repository) {
    throw new Error(
      `Repository "${repositoryFullName}" is not in this user's configured selection.`,
    );
  }

  return {
    installationId: repository.installationId,
    owner: repository.owner,
    name: repository.name,
    fullName: repository.fullName,
  };
}

/**
 * Verify tenant ownership of `repositoryFullName`, then return an Octokit
 * client authenticated as that repository's GitHub App installation.
 */
export async function octokitForTenant(
  ctx: Pick<SessionContext, "session">,
  repositoryFullName: string,
): Promise<Octokit> {
  const repository = await tenantRepository(ctx, repositoryFullName);
  const token = await mintInstallationToken(repository.installationId);
  return new Octokit({ auth: token });
}
