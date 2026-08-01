import { NextRequest } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { hashPassword } from "@/lib/auth/admin";
import { apiError, apiOk } from "@/lib/api/respond";

/**
 * Serverless fallback for scripts/seed-admin.mjs — for deploys where
 * running a one-off script isn't convenient. Guarded by a shared secret
 * header rather than an admin session (there's no admin yet on first
 * boot). 404s (not 401/403) when ADMIN_SEED_TOKEN is unset, so the route's
 * existence isn't revealed on deployments that haven't opted in.
 */
export async function POST(req: NextRequest) {
  const seedToken = process.env.ADMIN_SEED_TOKEN;
  if (!seedToken) {
    return apiError(404, "Not found.", "not_found");
  }

  const provided = req.headers.get("x-seed-token");
  if (!provided || provided !== seedToken) {
    return apiError(404, "Not found.", "not_found");
  }

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!email || !password) {
    return apiError(
      500,
      "ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD must be set to seed an admin account.",
      "missing_env",
    );
  }

  const { hash, salt } = hashPassword(password);
  const result = await fetchMutation(api.adminUsers.seedIfMissing, {
    email,
    passwordHash: hash,
    passwordSalt: salt,
  });

  return apiOk({ created: result.created });
}
