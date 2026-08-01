import { NextRequest } from "next/server";
import { z } from "zod";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { getSessionUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/rate-limit";
import { apiError, apiOk } from "@/lib/api/respond";

const bodySchema = z.object({ code: z.string().trim().min(1).max(64) });

const REASON_MESSAGES: Record<string, string> = {
  not_found: "That code doesn't exist. Double-check it and try again.",
  revoked: "That code has been revoked.",
  expired: "That code has expired.",
  exhausted: "That code has already been used up.",
};

/**
 * Self-serve invite-code redemption, offered as an optional step in
 * onboarding right after token verification. Session-authenticated — the
 * user id comes from the cookie, never the request body.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return apiError(401, "Not signed in.", "unauthenticated");

  const limited = rateLimit(`onboarding-invite:${session.userId}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!limited.allowed) {
    return apiError(429, "Too many attempts. Try again in a moment.", "rate_limited");
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, "Enter an invite code.", "invalid_body");
  }

  const result = await fetchMutation(api.inviteCodes.redeem, {
    code: parsed.data.code,
    userId: session.userId,
  });

  if (!result.ok) {
    return apiError(400, REASON_MESSAGES[result.reason] ?? "That code didn't work.", result.reason);
  }

  await fetchMutation(api.audit.record, {
    userId: session.userId,
    actor: "user",
    action: "onboarding.invite_redeemed",
    detail: `Redeemed invite code ${parsed.data.code.trim().toUpperCase()}.`,
  });

  return apiOk({ approved: true });
}
