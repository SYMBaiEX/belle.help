import { NextRequest } from "next/server";
import { z } from "zod";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getSessionUser } from "@/lib/auth/session";
import { apiError, apiOk } from "@/lib/api/respond";

const bodySchema = z.object({
  approvalId: z.string().min(1),
  status: z.enum(["approved", "denied"]),
});

/**
 * Resolves a pending approval from the dashboard. The text conversation
 * with Belle remains the primary approval surface — this is a convenience
 * for approvals reviewed on the web, and resolves the same underlying
 * Convex record either way.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return apiError(401, "Not signed in.", "unauthenticated");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Invalid request.", "invalid_body");

  const approvalId = parsed.data.approvalId as Id<"approvalRequests">;
  const pending = await fetchQuery(api.approvals.getPending, { userId: session.userId });
  const owns = pending.some((a) => a._id === approvalId);
  if (!owns) return apiError(404, "Approval not found.", "not_found");

  const result = await fetchMutation(api.approvals.resolve, {
    id: approvalId,
    status: parsed.data.status,
    userResponse: "Resolved from dashboard.",
  });

  if (!result.ok) return apiError(400, "Could not resolve this approval.", result.reason);

  await fetchMutation(api.audit.record, {
    userId: session.userId,
    actor: "user",
    action: `approval.${parsed.data.status}`,
    refs: { approvalId },
  });

  return apiOk({});
}
