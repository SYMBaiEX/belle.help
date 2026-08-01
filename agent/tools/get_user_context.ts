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

    const [user, conversationContext, pendingApprovals, repositories] = await Promise.all([
      db.query("users:getById", { userId: caller.userId }),
      db.query("conversationContexts:getByUserId", { userId: caller.userId }),
      db.query("approvals:getPending", { userId: caller.userId }),
      db.query("repositories:listByUser", { userId: caller.userId }),
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

    return {
      user: {
        name: u?.name,
        timeZone: u?.timeZone,
        aiMode: u?.aiMode,
        defaultMergeMethod: u?.defaultMergeMethod,
      },
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
