import { NextRequest } from "next/server";
import { z } from "zod";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { getSessionUser } from "@/lib/auth/session";
import { apiError, apiOk } from "@/lib/api/respond";

const bodySchema = z.object({
  quietHoursStart: z.number().min(0).max(23).optional(),
  quietHoursEnd: z.number().min(0).max(23).optional(),
  timeZone: z.string().optional(),
  digestHour: z.number().min(0).max(23).optional(),
  bundlingWindowSec: z.number().min(0).optional(),
  snoozedUntil: z.number().optional(),
  mode: z.enum(["all", "security_only", "ci_failures_only"]),
});

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return apiError(401, "Not signed in.", "unauthenticated");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "Invalid preferences.", "invalid_body");
  }

  await fetchMutation(api.notificationPreferences.upsert, {
    userId: session.userId,
    ...parsed.data,
  });

  await fetchMutation(api.audit.record, {
    userId: session.userId,
    actor: "user",
    action: "settings.notifications_updated",
  });

  return apiOk({});
}
