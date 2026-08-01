import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "../lib/convex";
import { requireTenantCaller } from "../lib/tenant";

const MAX_TTL_MINUTES = 1440;
const DEFAULT_TTL_MINUTES = 60;

export default defineTool({
  description:
    "Create a Convex approval record BEFORE calling any high-consequence tool (merge_pull_request, close_pull_request). Present `prompt` to the user in the conversation, wait for their answer, then call resolve_approval, and if approved pass the returned approvalId into the gated tool. Never call a high-consequence tool without first creating and resolving an approval this way.",
  inputSchema: z.object({
    action: z.string().min(1).describe('e.g. "merge_pull_request"'),
    repositoryFullName: z.string().min(1).describe("owner/repo"),
    prNumber: z.number().int().positive().optional(),
    headSha: z.string().optional(),
    findingIds: z.array(z.string()).optional(),
    prompt: z.string().min(1).describe("Human-readable text to show the user asking for approval"),
    params: z.record(z.string(), z.unknown()).optional(),
    expiresInMinutes: z.number().int().positive().max(MAX_TTL_MINUTES).optional(),
  }),
  async execute(
    { action, repositoryFullName, prNumber, headSha, findingIds, prompt, params, expiresInMinutes },
    ctx,
  ) {
    const caller = requireTenantCaller(ctx);
    const ttlMs = (expiresInMinutes ?? DEFAULT_TTL_MINUTES) * 60 * 1000;

    const approvalId = (await db.mutation("approvals:createRequest", {
      userId: caller.userId,
      action,
      repositoryFullName,
      prNumber,
      headSha,
      findingIds,
      params,
      prompt,
      channel: "linq",
      ttlMs,
    })) as string;

    const expiresAt = Date.now() + ttlMs;

    if (caller.linqChatId) {
      await db.mutation("conversationContexts:upsert", {
        userId: caller.userId,
        linqChatId: caller.linqChatId,
        pendingApprovalId: approvalId,
      });
    }

    return { approvalId, expiresAt };
  },
});
