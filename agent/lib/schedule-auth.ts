/**
 * Auth principal for turns a schedule dispatches on a user's behalf.
 *
 * `appAuth` (the pre-built `{ authenticator: "app", principalId: "eve:app",
 * principalType: "runtime" }` principal) identifies the *runtime*, not a
 * person. Every Belle tool derives its tenant from `session.auth.current` and
 * requires `principalType === "user"`, so a turn dispatched with `appAuth`
 * makes the first tool call fail with "An authenticated Belle user is
 * required for this action."
 *
 * That is not a harmless error: eve cascades `step.failed → turn.failed →
 * session.failed`, and `session.failed` is terminal. A scheduled turn landing
 * in a user's Linq conversation therefore destroyed that conversation's
 * history — and the reconcile schedule runs every five minutes.
 *
 * Scheduled work is always *for* a specific user, and the schedule already
 * knows which one, so stamp that user. This mirrors exactly what
 * `agent/channels/linq.ts` stamps on an inbound message, which keeps tenant
 * resolution and the approval policy behaving identically whether a turn was
 * started by a text or by cron.
 */
export function scheduledUserAuth(userId: string, linqChatId: string) {
  return {
    authenticator: "linq",
    principalType: "user" as const,
    principalId: userId,
    attributes: {
      tenantId: userId,
      linqChatId,
      protocol: "unknown",
      // Marks the turn as cron-initiated. Tools and policies can read this
      // when they need to distinguish automated work from a live reply;
      // it does not weaken any approval requirement.
      dispatchedBy: "schedule",
    },
  };
}
