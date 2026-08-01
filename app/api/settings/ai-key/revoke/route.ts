import { NextRequest } from "next/server";
import { z } from "zod";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getSessionUser } from "@/lib/auth/session";
import { apiError, apiOk } from "@/lib/api/respond";

const bodySchema = z.object({ credentialId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return apiError(401, "Not signed in.", "unauthenticated");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Missing credential id.", "invalid_body");

  const result = await fetchMutation(api.encryptedCredentials.revoke, {
    credentialId: parsed.data.credentialId as Id<"encryptedCredentials">,
    userId: session.userId,
  });

  if (!result.ok) return apiError(404, "Credential not found.", result.reason);

  await fetchMutation(api.userSettings.setAiMode, {
    userId: session.userId,
    aiMode: "managed",
  });

  await fetchMutation(api.audit.record, {
    userId: session.userId,
    actor: "user",
    action: "settings.ai_key_revoked",
  });

  return apiOk({});
}
