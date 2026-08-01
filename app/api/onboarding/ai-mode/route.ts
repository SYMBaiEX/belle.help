import { NextRequest } from "next/server";
import { z } from "zod";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { getSessionUser } from "@/lib/auth/session";
import { apiError, apiOk } from "@/lib/api/respond";

const bodySchema = z.object({ aiMode: z.enum(["byok", "managed"]) });

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return apiError(401, "Not signed in.", "unauthenticated");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Invalid AI mode.", "invalid_body");

  await fetchMutation(api.userSettings.setAiMode, {
    userId: session.userId,
    aiMode: parsed.data.aiMode,
  });

  await fetchMutation(api.audit.record, {
    userId: session.userId,
    actor: "user",
    action: "settings.ai_mode_changed",
    detail: `AI mode set to ${parsed.data.aiMode}`,
  });

  return apiOk({ aiMode: parsed.data.aiMode });
}
