import { NextRequest, NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { verifyInstallState } from "@/lib/github/state";
import { getInstallationAccount, listInstallationRepositories } from "@/lib/github/sync";

/**
 * GitHub redirects here after a user installs (or updates) the Belle
 * GitHub App, with `installation_id`, `setup_action`, and our signed
 * `state`. The `state` is the only thing that ties this callback back to a
 * Belle user — `installation_id` alone is never trusted.
 *
 * On any GitHub-side error this redirects to /dashboard/repositories with a
 * short error code rather than surfacing a stack trace.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const installationIdRaw = url.searchParams.get("installation_id");
  const setupAction = url.searchParams.get("setup_action");
  const state = url.searchParams.get("state");

  const verified = verifyInstallState(state);
  if (!verified) {
    return NextResponse.redirect(new URL("/dashboard/repositories?error=invalid_state", req.url), {
      status: 401,
    });
  }

  const installationId = installationIdRaw ? Number(installationIdRaw) : NaN;
  if (!installationIdRaw || Number.isNaN(installationId)) {
    return NextResponse.redirect(
      new URL("/dashboard/repositories?error=missing_installation", req.url),
    );
  }

  const userId = verified.userId as Id<"users">;

  try {
    const account = await getInstallationAccount(installationId);

    await fetchMutation(api.githubInstallations.upsert, {
      userId,
      installationId,
      accountLogin: account.accountLogin,
      accountType: account.accountType,
    });

    const repos = await listInstallationRepositories(installationId);

    const syncResult = await fetchMutation(api.githubSync.syncRepositories, {
      userId,
      installationId,
      repos: repos.map((r) => ({
        owner: r.owner,
        name: r.name,
        fullName: r.fullName,
        defaultBranch: r.defaultBranch,
      })),
    });

    await fetchMutation(api.audit.record, {
      userId,
      actor: "user",
      action: "github.installation_connected",
      detail: `Installed GitHub App for ${account.accountLogin} (${syncResult.total} repos, ${syncResult.added} added, ${syncResult.updated} updated).`,
    });

    const destination =
      setupAction === "install"
        ? "/onboarding?github=connected"
        : "/dashboard/repositories?synced=1";

    return NextResponse.redirect(new URL(destination, req.url));
  } catch {
    return NextResponse.redirect(new URL("/dashboard/repositories?error=github_sync_failed", req.url));
  }
}
