import { getSessionUser } from "@/lib/auth/session";
import { apiError } from "@/lib/api/respond";
import { createInstallState } from "@/lib/github/state";

/**
 * Kicks off the GitHub App install flow: redirect the signed-in user to the
 * public install URL with a signed `state` tying the eventual callback back
 * to this Belle user (see /api/github/callback and lib/github/state.ts).
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return apiError(401, "Not signed in.", "unauthenticated");

  const installUrl = process.env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL;
  if (!installUrl) {
    return apiError(503, "GitHub App is not configured yet.", "not_configured");
  }

  const state = createInstallState(session.userId);
  const separator = installUrl.includes("?") ? "&" : "?";
  const redirectUrl = `${installUrl}${separator}state=${encodeURIComponent(state)}`;

  return Response.redirect(redirectUrl, 307);
}
