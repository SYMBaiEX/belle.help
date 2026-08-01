import { getSessionUser } from "@/lib/auth/session";
import { apiError, apiOk } from "@/lib/api/respond";

/**
 * The GitHub App installation itself arrives asynchronously via webhook
 * (githubInstallations gets upserted there). This endpoint just lets the
 * onboarding client move on to the next step after the user says they've
 * installed the app — it does not (and cannot) confirm the install itself.
 */
export async function POST() {
  const session = await getSessionUser();
  if (!session) return apiError(401, "Not signed in.", "unauthenticated");
  return apiOk({});
}
