import { NextRequest } from "next/server";
import { z } from "zod";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { getAdminEmail, hashPassword, passwordPolicy, verifyPassword } from "@/lib/auth/admin";
import { apiError, apiOk } from "@/lib/api/respond";

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const email = await getAdminEmail();
  if (!email) return apiError(401, "Not signed in.", "unauthenticated");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, "Missing current or new password.", "invalid_body");
  }

  const admin = await fetchQuery(api.adminUsers.getByEmail, { email });
  if (!admin) return apiError(401, "Not signed in.", "unauthenticated");

  if (!verifyPassword(parsed.data.currentPassword, admin.passwordHash, admin.passwordSalt)) {
    return apiError(401, "Current password is incorrect.", "invalid_current_password");
  }

  const policyError = passwordPolicy(parsed.data.newPassword);
  if (policyError) {
    return apiError(400, policyError, "weak_password");
  }

  const { hash, salt } = hashPassword(parsed.data.newPassword);
  await fetchMutation(api.adminUsers.updatePassword, {
    email,
    passwordHash: hash,
    passwordSalt: salt,
  });

  return apiOk({});
}
