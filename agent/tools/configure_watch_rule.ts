import { defineTool } from "eve/tools";
import { z } from "zod";
import { db, recordAudit } from "../lib/convex";
import { requireTenantCaller } from "../lib/tenant";

export default defineTool({
  description:
    "Configure Belle's watch rule and policy for a repository: watch on/off and expiry, autonomy level (0-4), auto/security review, draft and CI-failure notifications, review publishing policy, author/branch/label filters, and digest inclusion. Only the fields you pass are changed.",
  inputSchema: z.object({
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    watchEnabled: z.boolean().optional(),
    watchExpiresAt: z
      .number()
      .optional()
      .describe("Epoch ms when the watch should expire (temporary watch)"),
    autonomyLevel: z.number().int().min(0).max(4).optional(),
    autoReview: z.boolean().optional(),
    securityReview: z.boolean().optional(),
    notifyDrafts: z.boolean().optional(),
    notifyCiFailures: z.boolean().optional(),
    reviewPolicy: z
      .enum(["internal_only", "blocking_only", "blocking_important", "high_confidence", "always_ask"])
      .optional(),
    branchFilters: z.array(z.string()).optional(),
    authorFilters: z.array(z.string()).optional(),
    labelFilters: z.array(z.string()).optional(),
    dailyDigest: z.boolean().optional(),
    weeklyDigest: z.boolean().optional(),
  }),
  async execute({ repositoryFullName, ...changes }, ctx) {
    const caller = requireTenantCaller(ctx);

    const repo = (await db.query("repositories:getByUserAndFullName", {
      userId: caller.userId,
      fullName: repositoryFullName,
    })) as { _id: string } | null;
    if (!repo) {
      throw new Error(`Repository ${repositoryFullName} is not configured for this user.`);
    }

    const patch = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(patch).length > 0) {
      await db.mutation("repositories:updateConfig", { repositoryId: repo._id, ...patch });
    }

    await recordAudit({
      userId: caller.userId,
      actor: "belle",
      action: "configure_watch_rule",
      repositoryFullName,
      detail: Object.entries(patch)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" "),
    });

    return { repositoryFullName, applied: patch };
  },
});
