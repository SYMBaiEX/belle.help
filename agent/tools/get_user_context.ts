import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "../lib/convex";
import { requireTenantCaller } from "../lib/tenant";

export default defineTool({
  description:
    "Get the current Belle user's profile, active conversation context (repo/PR/head SHA/pending approval), any pending approvals, and a summary of watched repositories. Call this at the start of a conversation or whenever you need to reorient.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const caller = requireTenantCaller(ctx);

    const [user, conversationContext, pendingApprovals, repositories, userMemories] =
      await Promise.all([
        db.query("users:getById", { userId: caller.userId }),
        db.query("conversationContexts:getByUserId", { userId: caller.userId }),
        db.query("approvals:getPending", { userId: caller.userId }),
        db.query("repositories:listByUser", { userId: caller.userId }),
        // Durable memory. eve compacts older turns, so anything the user told
        // Belle earlier only survives if it was written down — read it back
        // here so reorienting actually restores what was learned.
        db.query("memories:listByUserAndScope", { userId: caller.userId, scope: "user" }),
      ]);

    const u = user as {
      name?: string;
      timeZone?: string;
      aiMode?: string;
      defaultMergeMethod?: string;
    } | null;

    const cc = conversationContext as {
      activeRepositoryFullName?: string;
      activePrNumber?: number;
      activeHeadSha?: string;
      pendingApprovalId?: string;
    } | null;

    const approvals = (pendingApprovals as Array<{
      _id: string;
      action: string;
      repositoryFullName: string;
      prNumber?: number;
      prompt: string;
      expiresAt: number;
    }>) ?? [];

    const repos = (repositories as Array<{
      fullName: string;
      autonomyLevel: number;
      watchEnabled: boolean;
    }>) ?? [];

    const memories = (userMemories as Array<{ key: string; value: string }>) ?? [];

    return {
      user: {
        name: u?.name,
        timeZone: u?.timeZone,
        aiMode: u?.aiMode,
        defaultMergeMethod: u?.defaultMergeMethod,
      },
      // Facts Belle previously chose to remember. These survive compaction,
      // so treat them as authoritative about the user's stated preferences.
      remembered: memories.map((m) => ({ key: m.key, value: m.value })),
      conversationContext: {
        activeRepositoryFullName: cc?.activeRepositoryFullName,
        activePrNumber: cc?.activePrNumber,
        activeHeadSha: cc?.activeHeadSha,
        pendingApprovalId: cc?.pendingApprovalId,
      },
      pendingApprovals: approvals.map((a) => ({
        approvalId: a._id,
        action: a.action,
        repositoryFullName: a.repositoryFullName,
        prNumber: a.prNumber,
        prompt: a.prompt,
        expiresAt: a.expiresAt,
      })),
      watchedRepositories: repos.map((r) => ({
        fullName: r.fullName,
        autonomyLevel: r.autonomyLevel,
        watchEnabled: r.watchEnabled,
      })),
    };
  },
});
