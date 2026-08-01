import { NextRequest } from "next/server";
import { z } from "zod";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getAdminEmail } from "@/lib/auth/admin";
import { apiError, apiOk } from "@/lib/api/respond";

const bodySchema = z.object({ inviteCodeId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const adminEmail = await getAdminEmail();
  if (!adminEmail) return apiError(401, "Not signed in.", "unauthenticated");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, "Missing inviteCodeId.", "invalid_body");
  }

  await fetchMutation(api.inviteCodes.revoke, {
    inviteCodeId: parsed.data.inviteCodeId as Id<"inviteCodes">,
  });

  await fetchMutation(api.audit.record, {
    actor: "user",
    action: "admin.invite_code.revoked",
    detail: `Invite code revoked by ${adminEmail}.`,
    refs: { inviteCodeId: parsed.data.inviteCodeId },
  });

  return apiOk({});
}
