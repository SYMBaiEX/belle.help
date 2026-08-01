import { NextRequest } from "next/server";
import { z } from "zod";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getAdminEmail } from "@/lib/auth/admin";
import { apiError, apiOk } from "@/lib/api/respond";

const bodySchema = z.object({
  userId: z.string().min(1),
  approvalStatus: z.enum(["pending", "approved", "denied"]),
});

export async function POST(req: NextRequest) {
  const adminEmail = await getAdminEmail();
  if (!adminEmail) return apiError(401, "Not signed in.", "unauthenticated");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, "Invalid request.", "invalid_body");
  }

  const userId = parsed.data.userId as Id<"users">;

  await fetchMutation(api.users.setApprovalStatus, {
    userId,
    approvalStatus: parsed.data.approvalStatus,
    approvedBy: adminEmail,
  });

  await fetchMutation(api.audit.record, {
    userId,
    actor: "user",
    action: "admin.user.approval_status_changed",
    detail: `Set to "${parsed.data.approvalStatus}" by ${adminEmail}.`,
  });

  return apiOk({});
}
