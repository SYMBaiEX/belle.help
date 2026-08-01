import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { SESSION_COOKIE_NAME, getSessionUser } from "@/lib/auth/session";
import { apiError, apiOk } from "@/lib/api/respond";

export async function POST() {
  const session = await getSessionUser();
  if (!session) return apiError(401, "Not signed in.", "unauthenticated");

  const result = await fetchMutation(api.accountDeletion.deleteAccount, {
    userId: session.userId,
  });

  if (!result.ok) return apiError(404, "Account not found.", result.reason);

  const res = apiOk({});
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
