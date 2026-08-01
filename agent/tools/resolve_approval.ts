import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "../lib/convex";
import { requireTenantCaller } from "../lib/tenant";

export default defineTool({
  description:
    "Call when the user answers a pending approval prompt (from create_approval_request). Records their decision. If approved, proceed to call the gated high-consequence tool, passing the same approvalId — it will re-validate the approval before acting.",
  inputSchema: z.object({
    approvalId: z.string().min(1),
    decision: z.enum(["approved", "denied"]),
    userResponse: z.string().optional(),
  }),
  async execute({ approvalId, decision, userResponse }, ctx) {
    requireTenantCaller(ctx);

    const result = (await db.mutation("approvals:resolve", {
      id: approvalId,
      status: decision,
      userResponse,
    })) as { ok: true } | { ok: false; reason: string };

    if (!result.ok) {
      throw new Error(`Could not resolve approval ${approvalId}: ${result.reason}`);
    }

    return { approvalId, decision };
  },
});
