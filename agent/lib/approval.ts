import type { ApprovalContext, ApprovalStatus } from "eve/tools";
import { db } from "./convex";

/**
 * Belle's approval policy adapter (Eve multi-tenant approvals pattern).
 *
 * Two layers must agree before a high-consequence action executes:
 *  1. Eve runtime approval (this policy returning "user-approval" parks the
 *     session until the user answers over text).
 *  2. The Convex `approvalRequests` product record, created by the tool
 *     before parking and re-validated inside `execute` (head SHA, expiry,
 *     scope) — approval is a gate, not authorization.
 */

export type ActionConsequence = "low" | "moderate" | "high";

/** Autonomy level required for each action when pre-authorized. */
const MODERATE_ACTIONS: Record<string, true> = {
  add_review_comment: true,
  submit_review: true,
  request_reviewer: true,
  add_label: true,
  rerun_check: true,
};

const HIGH_ACTIONS: Record<string, true> = {
  push_approved_changes: true,
  merge_pull_request: true,
  create_fix_run: true,
  close_pull_request: true,
  open_pull_request: true,
};

function tenantOf(auth: ApprovalContext["session"]["auth"]["current"]): string | null {
  const t = auth?.attributes.tenantId;
  return typeof t === "string" ? t : null;
}

export async function decideBelleApproval(ctx: ApprovalContext): Promise<ApprovalStatus> {
  const current = ctx.session.auth.current;
  const tenantId = tenantOf(current);
  const initiatorTenant = tenantOf(ctx.session.auth.initiator);

  // Sessions must be pinned to exactly one tenant user for any gated action.
  if (current?.principalType !== "user" || !tenantId || tenantId !== initiatorTenant) {
    return { type: "denied", reason: "This session is not pinned to a single Belle user." };
  }

  // Invite-only: an unapproved account can read its own data but may never
  // take an action that touches GitHub. The Linq channel already gates
  // messages; this covers the dashboard/web surface too.
  const approval = (await db.query("users:getApprovalStatus", {
    userId: current.principalId,
  })) as { approvalStatus?: string } | null;
  if (approval && approval.approvalStatus !== "approved") {
    return {
      type: "denied",
      reason:
        "This Belle account is still pending access approval, so external actions are disabled.",
    };
  }

  const input = (ctx.toolInput ?? {}) as Record<string, unknown>;

  // Model input can never select another tenant.
  if (typeof input.tenantId === "string" && input.tenantId !== tenantId) {
    return { type: "denied", reason: "Tool input cannot select another tenant." };
  }

  const repositoryFullName =
    typeof input.repositoryFullName === "string" ? input.repositoryFullName : undefined;

  const consequence: ActionConsequence = HIGH_ACTIONS[ctx.toolName]
    ? "high"
    : MODERATE_ACTIONS[ctx.toolName]
      ? "moderate"
      : "low";

  if (consequence === "low") return "not-applicable";

  // Consult repository policy in Convex.
  if (!repositoryFullName) {
    return "user-approval"; // no repo context — always ask
  }

  const repo = (await db.query("repositories:getByUserAndFullName", {
    userId: current.principalId,
    fullName: repositoryFullName,
  })) as { autonomyLevel: number; watchEnabled: boolean } | null;

  if (!repo) {
    return { type: "denied", reason: `Repository ${repositoryFullName} is not configured for this user.` };
  }

  if (consequence === "moderate") {
    // Autonomy >= 2 pre-authorizes moderate GitHub writes; otherwise ask.
    return repo.autonomyLevel >= 2 ? "not-applicable" : "user-approval";
  }

  // High consequence: ALWAYS a fresh human approval, regardless of autonomy.
  // Autonomy levels below the action's floor are denied outright.
  const floor = ctx.toolName === "merge_pull_request" ? 4 : 3;
  if (repo.autonomyLevel < floor) {
    return {
      type: "denied",
      reason: `Repository autonomy level ${repo.autonomyLevel} does not permit ${ctx.toolName}. Raise it on the dashboard.`,
    };
  }
  return "user-approval";
}

/**
 * Re-validate the Convex product approval inside a high-consequence tool's
 * execute. Throws with a user-explainable message when invalid.
 */
export async function consumeProductApproval(args: {
  approvalId: string;
  userId: string;
  action: string;
  repositoryFullName: string;
  prNumber?: number;
  expectedHeadSha?: string;
}): Promise<void> {
  const result = (await db.mutation("approvals:consume", args)) as
    | { ok: true }
    | { ok: false; reason: string };
  if (!result.ok) {
    throw new Error(`Approval invalid: ${result.reason}. Ask the user to re-approve.`);
  }
}
