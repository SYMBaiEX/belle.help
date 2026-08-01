import { NextRequest } from "next/server";
import { z } from "zod";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getAdminEmail } from "@/lib/auth/admin";
import { apiError, apiOk } from "@/lib/api/respond";
import { isLinqConfigured, sendText } from "@/lib/linq/client";

const bodySchema = z.object({ requestId: z.string().min(1) });

const APPROVAL_MESSAGE = (appUrl: string) =>
  `You're approved! Chat away 🎉\n\n` +
  `Finish setup (or pick up where you left off): ${appUrl}/dashboard\n\n` +
  `Try:\n"Watch acme/api"\n"Review PR 142"\n"Why is CI failing?"\n\n` +
  `I'll always ask before changing code or merging.`;

export async function POST(req: NextRequest) {
  const adminEmail = await getAdminEmail();
  if (!adminEmail) return apiError(401, "Not signed in.", "unauthenticated");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, "Missing requestId.", "invalid_body");
  }

  let result;
  try {
    result = await fetchMutation(api.accessRequests.approve, {
      requestId: parsed.data.requestId as Id<"accessRequests">,
      adminEmail,
    });
  } catch {
    return apiError(404, "Access request not found.", "not_found");
  }

  let notified = false;
  let notifyError: string | undefined;

  if (isLinqConfigured()) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://belle.help";
    try {
      await sendText(result.linqChatId, APPROVAL_MESSAGE(appUrl), {
        idempotencyKey: `approve:${parsed.data.requestId}`,
      });
      notified = true;
      await fetchMutation(api.accessRequests.markApprovedNotified, {
        requestId: parsed.data.requestId as Id<"accessRequests">,
      });
    } catch (err) {
      notifyError = err instanceof Error ? err.message : "Failed to send approval text.";
    }
  } else {
    notifyError = "Linq is not configured — no approval text was sent.";
  }

  await fetchMutation(api.audit.record, {
    userId: result.userId ?? undefined,
    actor: "user",
    action: "admin.access_request.approved",
    detail: `Approved by ${adminEmail}${notified ? "; approval text sent." : `; text not sent (${notifyError}).`}`,
    refs: { requestId: parsed.data.requestId },
  });

  return apiOk({ notified, notifyError });
}
