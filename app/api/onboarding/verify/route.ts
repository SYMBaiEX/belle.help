import { NextRequest } from "next/server";
import { z } from "zod";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { verifyOnboardingToken, hashToken } from "@/lib/security/onboarding-links";
import {
  SESSION_COOKIE_NAME,
  createSessionCookie,
  sessionCookieOptions,
  getSessionUser,
} from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/rate-limit";
import { apiError, apiOk } from "@/lib/api/respond";

const bodySchema = z.object({ token: z.string().min(1) });

/**
 * Step 1 of onboarding: verify the signed token Belle texted, single-use
 * consume the onboarding session, create-or-find the user, and set the
 * session cookie. This is the one and only point where the onboarding
 * token is consumed — later steps rely on the cookie, not the token, so
 * the flow survives a page refresh even though the token itself can only
 * ever be used once.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const limited = rateLimit(`onboarding-verify:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!limited.allowed) {
    return apiError(429, "Too many attempts. Try again in a moment.", "rate_limited");
  }

  // Idempotent for refresh: if the browser already has a valid session,
  // don't try to consume the (now-invalid) token again.
  const existingSession = await getSessionUser();
  if (existingSession) {
    return apiOk({ userId: existingSession.userId });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, "Missing or malformed token.", "invalid_body");
  }

  const payload = verifyOnboardingToken(parsed.data.token);
  if (!payload) {
    return apiError(
      400,
      "This link is invalid or has expired. Text Belle again for a fresh link.",
      "invalid_token",
    );
  }

  const tokenHash = hashToken(parsed.data.token);
  const consumed = await fetchMutation(api.onboarding.consumeSession, { tokenHash });
  if (!consumed.ok) {
    const messages: Record<string, string> = {
      not_found: "This link doesn't match an active session. Text Belle again for a fresh link.",
      already_used: "This link has already been used. Text Belle again for a fresh link.",
      expired: "This link has expired. Text Belle again for a fresh link.",
    };
    return apiError(400, messages[consumed.reason] ?? "This link is no longer valid.", consumed.reason);
  }

  const phoneIdentity = await fetchQuery(api.phoneIdentitiesExtra.getById, {
    phoneIdentityId: consumed.session.phoneIdentityId,
  });
  if (!phoneIdentity) {
    return apiError(400, "We couldn't find your phone conversation. Text Belle again.", "phone_identity_missing");
  }

  let userId = phoneIdentity.userId;
  if (!userId) {
    userId = await fetchMutation(api.users.create, { aiMode: "managed" });
    await fetchMutation(api.phoneIdentities.attachUser, {
      phoneIdentityId: phoneIdentity._id,
      userId,
    });
  }

  await fetchMutation(api.audit.record, {
    userId,
    actor: "user",
    action: "onboarding.verified",
    detail: "Onboarding link verified and web session started.",
  });

  const cookieValue = createSessionCookie(userId);
  const res = apiOk({ userId });
  res.cookies.set(SESSION_COOKIE_NAME, cookieValue, sessionCookieOptions());
  return res;
}
