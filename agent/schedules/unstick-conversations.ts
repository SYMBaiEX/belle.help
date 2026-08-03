import { defineSchedule } from "eve/schedules";

import { isLinqConfigured, recentMessages, sendText } from "../../lib/linq/client";
import { internalToken } from "../../lib/security/internal-token";
import { db, recordAudit } from "../lib/convex";

/**
 * Watchdog for wedged conversations.
 *
 * A durable eve session queues inbound messages behind the turn that is
 * currently running. That is correct when a turn is making progress, and fatal
 * when it never finishes: every later message is accepted, acknowledged with
 * HTTP 200, dispatched to the session — and then silently held. From the
 * user's side Belle simply stops answering, with no error anywhere.
 *
 * This is not hypothetical. A `code-fixer` subagent was dispatched while the
 * root session had already consumed its input-token budget, so the child
 * inherited effectively no quota and stalled on its first model call. The
 * parent turn stayed in flight for two days and swallowed four messages. The
 * budget itself is fixed (see agent/agent.ts), but "a turn can hang" is a
 * permanent property of running work, not a bug that stays fixed — so the
 * recovery has to be structural.
 *
 * The check deliberately observes the user-visible symptom rather than
 * internal state: if the newest message in a chat is *from the user* and has
 * gone unanswered past the threshold, that conversation is broken no matter
 * which internal component is at fault. Cancelling the in-flight turn is safe
 * by design — eve treats `turn.cancelled` as a user decision, not a failure,
 * cancels adopted subagents recursively, keeps the session and its history,
 * and accepts the next message normally.
 */

/**
 * How long an inbound message may sit unanswered before the conversation is
 * considered wedged.
 *
 * Well above a slow-but-healthy turn: a review subagent measured ~2 minutes,
 * and a fix run with sandbox validation can legitimately run several. Ten
 * minutes of total silence is not a slow turn, it is a broken one.
 */
const STUCK_AFTER_MS = 10 * 60 * 1000;

/** Only inspect conversations that saw activity recently. */
const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface WatchableContext {
  _id: string;
  userId: string;
  linqChatId: string;
  eveSessionId: string;
  lastRecoveredMessageId?: string;
}

/** Base URL of this deployment, for calling our own eve routes. */
function selfUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : null;
}

/**
 * Cancel the in-flight turn on a session.
 *
 * Both `"accepted"` and `"no_active_turn"` are successes per eve's route
 * contract — the second just means the turn settled between our observation
 * and the call, which is a race we do not need to care about.
 */
async function cancelTurn(baseUrl: string, token: string, sessionId: string): Promise<boolean> {
  const res = await fetch(`${baseUrl}/eve/v1/session/${encodeURIComponent(sessionId)}/cancel`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: "{}",
  });

  if (!res.ok) {
    console.error(`[unstick] cancel failed for ${sessionId}: HTTP ${res.status}`);
    return false;
  }
  return true;
}

export default defineSchedule({
  cron: "*/5 * * * *",
  async run() {
    if (!isLinqConfigured()) return;

    const token = internalToken();
    const baseUrl = selfUrl();
    if (!token || !baseUrl) {
      // Loud, because a silent watchdog is worse than no watchdog: it looks
      // like coverage that does not exist.
      console.error(
        "[unstick] disabled — BELLE_INTERNAL_TOKEN and an app URL are both required " +
          "to cancel a wedged session. Conversations will not self-recover.",
      );
      return;
    }

    const contexts = (await db.query("conversationContexts:listWatchable", {
      activeSinceMs: ACTIVE_WINDOW_MS,
      limit: 50,
    })) as WatchableContext[];

    const now = Date.now();

    for (const context of contexts) {
      try {
        const messages = await recentMessages(context.linqChatId, 3);
        const latest = messages[0];

        // Healthy: no messages, or Belle spoke last.
        if (!latest || latest.fromMe) continue;
        if (now - latest.createdAt < STUCK_AFTER_MS) continue;

        // Already recovered this exact stall. Cancelling again would achieve
        // nothing and would cancel whatever legitimate turn is running now.
        if (context.lastRecoveredMessageId === latest.id) continue;

        console.warn(
          `[unstick] ${context.linqChatId} has an unanswered inbound ` +
            `${Math.round((now - latest.createdAt) / 60000)}m old — cancelling session ` +
            `${context.eveSessionId}`,
        );

        const cancelled = await cancelTurn(baseUrl, token, context.eveSessionId);
        if (!cancelled) continue;

        // Mark before texting: a failed send must not cause a second cancel on
        // the next tick.
        await db.mutation("conversationContexts:markRecovered", {
          id: context._id,
          messageId: latest.id,
        });

        await recordAudit({
          userId: context.userId,
          actor: "system",
          action: "conversation.unstuck",
          detail: `Cancelled wedged session ${context.eveSessionId}`,
        });

        // The cancelled turn produced nothing the user ever saw, and eve keeps
        // only settled history — so ask rather than pretend to resume.
        await sendText(
          context.linqChatId,
          "Sorry — I got stuck on something and never sent my reply. I'm back now. " +
            "Could you send that last message again?",
          { idempotencyKey: `unstick:${latest.id}` },
        );
      } catch (error) {
        // One bad conversation must not stop the sweep for everyone else.
        console.error(`[unstick] ${context.linqChatId} failed`, error);
      }
    }
  },
});
