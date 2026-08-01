import { NextRequest } from "next/server";
import { z } from "zod";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getAdminEmail } from "@/lib/auth/admin";
import { apiError, apiOk } from "@/lib/api/respond";

const bodySchema = z.object({
  requestId: z.string().min(1),
  note: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const adminEmail = await getAdminEmail();
  if (!adminEmail) return apiError(401, "Not signed in.", "unauthenticated");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, "Missing requestId.", "invalid_body");
  }

  try {
    await fetchMutation(api.accessRequests.deny, {
      requestId: parsed.data.requestId as Id<"accessRequests">,
      adminEmail,
      note: parsed.data.note,
    });
  } catch {
    return apiError(404, "Access request not found.", "not_found");
  }

  await fetchMutation(api.audit.record, {
    actor: "user",
    action: "admin.access_request.denied",
    detail: `Denied by ${adminEmail}${parsed.data.note ? `: ${parsed.data.note}` : ""}`,
    refs: { requestId: parsed.data.requestId },
  });

  // Denied users are never texted — no notification, per spec.
  return apiOk({});
}
