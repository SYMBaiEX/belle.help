import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { getSessionUser } from "@/lib/auth/session";
import { apiError, apiOk } from "@/lib/api/respond";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return apiError(401, "Not signed in.", "unauthenticated");

  const repositories = await fetchQuery(api.repositories.listByUser, {
    userId: session.userId,
  });

  return apiOk({ repositories });
}
