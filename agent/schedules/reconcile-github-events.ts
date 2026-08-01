import { defineSchedule } from "eve/schedules";

import linq from "../channels/linq";
import { db } from "../lib/convex";

interface ScheduledAction {
  _id: string;
  userId: string;
  kind: "auto_review" | "scheduled_merge" | "reminder" | "watch_expiry";
  repositoryFullName?: string;
  prNumber?: number;
  headSha?: string;
  payload?: unknown;
}

interface ConversationContext {
  linqChatId: string;
}

function reminderText(payload: unknown): string {
  if (payload && typeof payload === "object" && "text" in payload) {
    const text = (payload as { text?: unknown }).text;
    if (typeof text === "string" && text.length > 0) return text;
  }
  return "Check in on outstanding work.";
}

/** Builds the delivery text for one due action, or null when it isn't a channel-deliverable kind. */
function messageFor(action: ScheduledAction): string | null {
  switch (action.kind) {
    case "auto_review":
      return (
        `Auto-review was triggered for PR #${action.prNumber} in ${action.repositoryFullName} ` +
        `(head ${action.headSha}). Run the full review workflow now and report results to the user.`
      );
    case "scheduled_merge":
      return (
        `A scheduled merge check is due for PR #${action.prNumber} in ${action.repositoryFullName} ` +
        `(head ${action.headSha}). Re-run merge readiness (checks, approvals, blockers) and ask the ` +
        `user to confirm, or act per the repository's autonomy policy.`
      );
    case "reminder":
      return `Deliver this reminder to the user: ${reminderText(action.payload)}`;
    case "watch_expiry":
      // Handled separately by expire-temporary-watch-rules.md, which reads
      // repositories.watchExpiresAt directly rather than a scheduledActions row.
      return null;
    default:
      return null;
  }
}

export default defineSchedule({
  cron: "*/5 * * * *",
  async run({ receive, waitUntil, appAuth }) {
    const due = (await db.query("scheduledActions:listDue", {
      now: Date.now(),
    })) as ScheduledAction[];

    for (const action of due) {
      const message = messageFor(action);
      if (!message) continue;

      const context = (await db.query("conversationContexts:getByUserId", {
        userId: action.userId,
      })) as ConversationContext | null;

      // No active Linq conversation to deliver to — leave it queued rather
      // than marking it dispatched and silently dropping it.
      if (!context) continue;

      await db.mutation("scheduledActions:markDispatched", { actionId: action._id });

      waitUntil(
        receive(linq, {
          message,
          target: { adapterName: "linq", threadId: context.linqChatId },
          auth: appAuth,
        }),
      );
    }
  },
});
