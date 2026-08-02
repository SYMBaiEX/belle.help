import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "../lib/convex";
import { tenantCallerOrError } from "../lib/tenant";

export default defineTool({
  description:
    "Call when the user answers a pending approval prompt (from create_approval_request). Records their decision. If approved, proceed to call the gated high-consequence tool, passing the same approvalId — it will re-validate the approval before acting. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
  inputSchema: z.object({
    approvalId: z.string().min(1),
    decision: z.enum(["approved", "denied"]),
    userResponse: z.string().optional(),
  }),
  async execute({ approvalId, decision, userResponse }, ctx) {
    const tenant = tenantCallerOrError(ctx);
    if (!tenant.ok) return tenant;

    const result = (await db.mutation("approvals:resolve", {
      id: approvalId,
      status: decision,
      userResponse,
    })) as { ok: true } | { ok: false; reason: string };

    if (!result.ok) {
      return {
        ok: false as const,
        reason: "approval_could_not_resolve",
        message: "I could not resolve that approval, so please create a new approval request.",
      };
    }

    return { ok: true as const, approvalId, decision };
  },
});
