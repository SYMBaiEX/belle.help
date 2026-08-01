import { defineTool } from "eve/tools";
import { z } from "zod";
import { recordAudit } from "../lib/convex";
import { requireTenantCaller } from "../lib/tenant";

export default defineTool({
  description: "Record an audit-log entry for an action Belle took, for the user's activity history.",
  inputSchema: z.object({
    action: z.string().min(1),
    repositoryFullName: z.string().optional(),
    prNumber: z.number().int().positive().optional(),
    detail: z.string().optional(),
  }),
  async execute({ action, repositoryFullName, prNumber, detail }, ctx) {
    const caller = requireTenantCaller(ctx);

    await recordAudit({
      userId: caller.userId,
      actor: "belle",
      action,
      repositoryFullName,
      prNumber,
      detail,
    });

    return { recorded: true };
  },
});
