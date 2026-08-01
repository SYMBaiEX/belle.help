import { anyApi } from "convex/server";
import { ConvexHttpClient } from "convex/browser";
import { sleep } from "workflow";

import { sendText, isLinqConfigured } from "@/lib/linq/client";

/**
 * Durable deferred actions (Vercel Workflow SDK).
 *
 * Replaces cron-polling of `scheduledActions` rows with a run that sleeps
 * until the action is due, then acts directly — no 5-minute reconcile
 * latency for the common case. `agent/schedules/reconcile-github-events.ts`
 * remains as the safety net for rows whose workflow never started (see the
 * comment there).
 *
 * NOTE ON PLACEMENT: workflow directives are only legal in the Next.js tree.
 * eve's build rejects "use workflow"/"use step" inside `agent/**`, so this
 * lives under `app/workflows/` alongside `sync-repositories.ts`.
 */

function convex(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set.");
  return new ConvexHttpClient(url);
}

export interface DeferredActionInput {
  actionId: string;
  userId: string;
  kind: "watch_expiry" | "reminder";
  runAfter: number;
  repositoryFullName?: string;
  text?: string;
}

/**
 * Record-then-send outbound notification, mirroring
 * `agent/channels/github.ts` `notifyUser`: record the message via
 * `outboundMessages:recordIfNew` first (so the existing flush sweep can
 * retry it) before attempting the live send.
 */
async function notifyUser(userId: string, text: string, idempotencyKey: string): Promise<void> {
  "use step";

  const context = (await convex().query(anyApi.conversationContexts!.getByUserId!, {
    userId,
  })) as { linqChatId: string } | null;
  if (!context?.linqChatId) return; // no active text conversation yet — skip silently

  const recorded = (await convex().mutation(anyApi.outboundMessages!.recordIfNew!, {
    userId,
    linqChatId: context.linqChatId,
    idempotencyKey,
    body: text,
  })) as { duplicate: boolean; id?: string };
  if (recorded.duplicate) return;

  if (!isLinqConfigured()) {
    console.warn("[deferred-action-workflow] LINQ_API_KEY not set — notification recorded but not sent");
    return;
  }
  try {
    await sendText(context.linqChatId, text, { idempotencyKey });
    if (recorded.id) await convex().mutation(anyApi.outboundMessages!.markSent!, { id: recorded.id });
  } catch (error) {
    if (recorded.id) await convex().mutation(anyApi.outboundMessages!.markFailed!, { id: recorded.id });
    console.error("[deferred-action-workflow] Linq send failed", error);
  }
}

/** Step: verify the repository watch is still due to expire (skip if extended). */
async function checkWatchStillDue(
  userId: string,
  repositoryFullName: string,
  runAfter: number,
): Promise<{ due: boolean; repositoryId?: string } | null> {
  "use step";
  const repo = (await convex().query(anyApi.repositories!.getByUserAndFullName!, {
    userId,
    fullName: repositoryFullName,
  })) as { _id: string; watchExpiresAt?: number } | null;
  if (!repo) return null;
  const due = repo.watchExpiresAt !== undefined && repo.watchExpiresAt <= Date.now();
  // Guard against a run scheduled for a since-superseded expiry.
  if (repo.watchExpiresAt !== undefined && repo.watchExpiresAt !== runAfter && repo.watchExpiresAt > Date.now()) {
    return { due: false, repositoryId: repo._id };
  }
  return { due, repositoryId: repo._id };
}

/** Step: disable the repository watch. */
async function disableWatch(repositoryId: string): Promise<void> {
  "use step";
  await convex().mutation(anyApi.repositories!.updateConfig!, {
    repositoryId,
    watchEnabled: false,
  });
}

/** Step: record an audit event. */
async function auditEvent(
  userId: string,
  action: string,
  repositoryFullName: string | undefined,
  detail: string,
): Promise<void> {
  "use step";
  await convex().mutation(anyApi.audit!.record!, {
    userId,
    actor: "belle",
    action,
    repositoryFullName,
    detail,
  });
}

/** Step: mark the scheduledActions row completed. */
async function markScheduledActionCompleted(actionId: string): Promise<void> {
  "use step";
  await convex().mutation(anyApi.scheduledActions!.markCompleted!, { actionId });
}

/**
 * Durable entrypoint. Sleeps until `runAfter`, then acts on the deferred
 * action and marks the underlying `scheduledActions` row completed.
 */
export async function deferredActionWorkflow(input: DeferredActionInput): Promise<void> {
  "use workflow";

  const remainingMs = Math.max(0, input.runAfter - Date.now());
  await sleep(remainingMs);

  if (input.kind === "watch_expiry") {
    const repositoryFullName = input.repositoryFullName;
    if (!repositoryFullName) {
      await auditEvent(input.userId, "deferred.watch_expiry_skipped", undefined, "missing repositoryFullName");
      await markScheduledActionCompleted(input.actionId);
      return;
    }

    const status = await checkWatchStillDue(input.userId, repositoryFullName, input.runAfter);
    if (!status || !status.due || !status.repositoryId) {
      await auditEvent(
        input.userId,
        "deferred.watch_expiry_skipped",
        repositoryFullName,
        status
          ? "watch was extended or already disabled before expiry ran"
          : "repository no longer configured for this user",
      );
      await markScheduledActionCompleted(input.actionId);
      return;
    }

    await disableWatch(status.repositoryId);
    await auditEvent(
      input.userId,
      "deferred.watch_expiry",
      repositoryFullName,
      "watch disabled after expiry",
    );
    await notifyUser(
      input.userId,
      `Watch expired for ${repositoryFullName} — text me to start watching again.`,
      `watch-expiry:${input.userId}:${repositoryFullName}:${input.runAfter}`,
    );
    await markScheduledActionCompleted(input.actionId);
    return;
  }

  // kind === "reminder"
  const text = input.text && input.text.length > 0 ? input.text : "Check in on outstanding work.";
  await notifyUser(input.userId, text, `reminder:${input.userId}:${input.actionId}:${input.runAfter}`);
  await auditEvent(input.userId, "deferred.reminder", input.repositoryFullName, "reminder delivered");
  await markScheduledActionCompleted(input.actionId);
}
