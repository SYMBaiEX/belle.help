import { defineTool } from "eve/tools";
import { z } from "zod";

import { db, recordAudit } from "../lib/convex";
import { requireTenantCaller } from "../lib/tenant";

/**
 * Durable memory for Belle.
 *
 * Conversation history is not permanent: eve compacts older turns as a session
 * approaches the context window, so anything only ever "said" eventually gets
 * summarized away. A texting relationship lasts weeks, so facts worth keeping
 * must be written down deliberately.
 */
export default defineTool({
  description:
    "Remember a durable fact so it survives long after this conversation is compacted. Use it whenever the user states a preference, a convention, a correction, or a decision worth honoring later — their time zone, quiet hours, preferred merge method, how a repository builds and tests, sensitive areas to be careful with, review feedback they accepted or rejected, or who normally reviews what. Prefer one clear fact per call, with a short stable key you would search by later. Writing the same key again updates it rather than duplicating.",
  inputSchema: z.object({
    scope: z
      .enum(["user", "repository", "conversation"])
      .describe(
        "user = true anywhere (preferences, time zone). repository = specific to one repo (build commands, conventions, risky areas). conversation = only relevant to the current thread.",
      ),
    key: z
      .string()
      .min(1)
      .max(80)
      .describe("Short stable identifier, e.g. 'preferred_merge_method' or 'test_command'."),
    value: z.string().min(1).max(2000).describe("The fact itself, in plain language."),
    repositoryFullName: z
      .string()
      .optional()
      .describe("Required when scope is 'repository' — owner/repo."),
  }),
  async execute({ scope, key, value, repositoryFullName }, ctx) {
    const caller = requireTenantCaller(ctx);

    if (scope === "repository" && !repositoryFullName) {
      return {
        stored: false as const,
        message: "A repositoryFullName is required when remembering something repository-scoped.",
      };
    }

    await db.mutation("memories:upsert", {
      userId: caller.userId,
      scope,
      key,
      value,
      ...(repositoryFullName ? { repositoryFullName } : {}),
    });

    await recordAudit({
      userId: caller.userId,
      actor: "belle",
      action: "memory.remembered",
      ...(repositoryFullName ? { repositoryFullName } : {}),
      detail: `${scope}:${key}`,
    });

    return { stored: true as const, scope, key };
  },
});
