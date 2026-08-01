import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "../lib/convex";
import { requireTenantCaller } from "../lib/tenant";

export default defineTool({
  description: "List every repository configured for this Belle user, with autonomy level and watch status.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const caller = requireTenantCaller(ctx);

    const repos = (await db.query("repositories:listByUser", {
      userId: caller.userId,
    })) as Array<{
      fullName: string;
      owner: string;
      name: string;
      defaultBranch?: string;
      autonomyLevel: number;
      watchEnabled: boolean;
      watchExpiresAt?: number;
      reviewPolicy: string;
    }>;

    return {
      repositories: repos.map((r) => ({
        fullName: r.fullName,
        owner: r.owner,
        name: r.name,
        defaultBranch: r.defaultBranch,
        autonomyLevel: r.autonomyLevel,
        watchEnabled: r.watchEnabled,
        watchExpiresAt: r.watchExpiresAt,
        reviewPolicy: r.reviewPolicy,
      })),
    };
  },
});
