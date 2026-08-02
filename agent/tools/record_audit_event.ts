import { defineTool } from "eve/tools";
import { z } from "zod";
import { recordAudit } from "../lib/convex";
import { tenantCallerOrError } from "../lib/tenant";

export default defineTool({
  description:
    "Record an audit-log entry for an action Belle took, for the user's activity history. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
  inputSchema: z.object({
    action: z.string().min(1),
    repositoryFullName: z.string().optional(),
    prNumber: z.number().int().positive().optional(),
    detail: z.string().optional(),
  }),
  async execute({ action, repositoryFullName, prNumber, detail }, ctx) {
    const tenant = tenantCallerOrError(ctx);
    if (!tenant.ok) return tenant;
    const { caller } = tenant;

    await recordAudit({
      userId: caller.userId,
      actor: "belle",
      action,
      repositoryFullName,
      prNumber,
      detail,
    });

    return { ok: true as const, recorded: true };
  },
});
