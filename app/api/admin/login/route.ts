import { NextRequest } from "next/server";
import { z } from "zod";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  createAdminCookie,
  verifyPassword,
} from "@/lib/auth/admin";
import { rateLimit } from "@/lib/auth/rate-limit";
import { apiError, apiOk } from "@/lib/api/respond";

const bodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const GENERIC_ERROR = "Invalid email or password.";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const limited = rateLimit(`admin-login:${ip}`, { limit: 5, windowMs: 15 * 60_000 });
  if (!limited.allowed) {
    return apiError(429, "Too many attempts. Try again in a few minutes.", "rate_limited");
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, GENERIC_ERROR, "invalid_body");
  }

  const email = parsed.data.email.toLowerCase();
  const admin = await fetchQuery(api.adminUsers.getByEmail, { email });

  // Constant-ish delay whether or not the account exists, so response
  // timing doesn't leak which emails have admin accounts.
  if (!admin || !verifyPassword(parsed.data.password, admin.passwordHash, admin.passwordSalt)) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return apiError(401, GENERIC_ERROR, "invalid_credentials");
  }

  await fetchMutation(api.adminUsers.recordLogin, { email });

  const cookieValue = createAdminCookie(email);
  const res = apiOk({ email });
  res.cookies.set(ADMIN_COOKIE, cookieValue, adminCookieOptions());
  return res;
}
