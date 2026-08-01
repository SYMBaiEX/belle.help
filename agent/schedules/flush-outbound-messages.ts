import { defineSchedule } from "eve/schedules";

import { isLinqConfigured, sendText } from "../../lib/linq/client";
import { db } from "../lib/convex";

interface UnsentMessage {
  _id: string;
  linqChatId: string;
  idempotencyKey: string;
  body: string;
  attempts?: number;
}

/**
 * Delivery safety net for outbound notifications.
 *
 * GitHub events are handled inside eve's channel hook, which runs in a single
 * serverless invocation. eve catches hook exceptions and still answers 200, so
 * GitHub never redelivers — a transient Convex or Linq failure would silently
 * lose the notification (this is exactly how a real PR notification was lost).
 *
 * The Workflow SDK would give per-step retries for this, but it cannot be
 * installed today: eve pins the `@workflow/*` 5.0.0-beta line while
 * `@github-tools/sdk` declares `peerOptional workflow@^4.5.0`, an
 * irreconcilable conflict (see docs/adr/006-durable-delivery.md).
 *
 * So delivery is made at-least-once here instead: every notification is
 * recorded in Convex *before* it is sent, and this sweep re-sends anything
 * that never reached "sent". Re-sending is safe because both our
 * `idempotencyKey` and Linq's own `idempotency_key` deduplicate the message,
 * so a user cannot be double-texted.
 */
export default defineSchedule({
  cron: "*/2 * * * *",
  async run() {
    if (!isLinqConfigured()) return;

    const pending = (await db.query("outboundMessages:listUnsent", {
      limit: 20,
    })) as UnsentMessage[];

    for (const message of pending) {
      // Count the attempt before trying, so a hard crash still backs off.
      await db.mutation("outboundMessages:recordAttempt", { id: message._id });
      try {
        await sendText(message.linqChatId, message.body, {
          idempotencyKey: message.idempotencyKey,
        });
        await db.mutation("outboundMessages:markSent", { id: message._id });
        console.info(
          `[flush-outbound] resent stranded message (attempt ${(message.attempts ?? 0) + 1})`,
        );
      } catch (error) {
        await db.mutation("outboundMessages:markFailed", { id: message._id });
        console.error("[flush-outbound] resend failed", error);
      }
    }
  },
});
