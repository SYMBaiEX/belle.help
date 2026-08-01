import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "../lib/convex";
import { requireTenantCaller } from "../lib/tenant";

/**
 * Enqueues a deferred action and starts a durable Vercel Workflow run that
 * sleeps until it is due. Use this for "remind me tomorrow", "watch this
 * repo until Friday", and similar requests where the user wants Belle to
 * act at a specific future time rather than right now.
 *
 * The Convex `scheduledActions` row is always written first, so
 * `agent/schedules/reconcile-github-events.ts` (the 5-minute cron sweep)
 * remains a safety net if the durable workflow never starts — this tool
 * degrades gracefully rather than throwing when that happens.
 */
export default defineTool({
  description:
    'Schedule a deferred action for later: "remind me tomorrow", "watch this repo until Friday", ' +
    "or any other request that should happen at a specific future time rather than immediately. " +
    "For kind=\"reminder\" pass `text`. For kind=\"watch_expiry\" pass `repositoryFullName` — the " +
    "repository's watch will be disabled at `runAfter` unless the user extends it first.",
  inputSchema: z.object({
    kind: z.enum(["watch_expiry", "reminder"]),
    runAfter: z.number().int().positive().describe("Epoch ms when the action should run"),
    repositoryFullName: z.string().min(1).optional().describe("owner/repo, required for watch_expiry"),
    text: z.string().min(1).optional().describe("Reminder text, required for reminder"),
  }),
  async execute({ kind, runAfter, repositoryFullName, text }, ctx) {
    const caller = requireTenantCaller(ctx);

    const actionId = (await db.mutation("scheduledActions:enqueue", {
      userId: caller.userId,
      kind,
      repositoryFullName,
      payload: text ? { text } : undefined,
      runAfter,
      createdAt: Date.now(),
    })) as string;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const secret = process.env.INTERNAL_TRIGGER_SECRET;

    if (!appUrl || !secret) {
      return {
        actionId,
        durable: false as const,
        note: "Durable scheduling is not configured — the 5-minute reconcile sweep will pick this up instead.",
      };
    }

    try {
      const res = await fetch(`${appUrl}/api/workflows/deferred`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-belle-internal": secret,
        },
        body: JSON.stringify({
          actionId,
          userId: caller.userId,
          kind,
          runAfter,
          repositoryFullName,
          text,
        }),
      });
      if (!res.ok) {
        return {
          actionId,
          durable: false as const,
          note: "Durable scheduling request failed — the 5-minute reconcile sweep will pick this up instead.",
        };
      }
      return { actionId, durable: true as const };
    } catch {
      return {
        actionId,
        durable: false as const,
        note: "Durable scheduling request failed — the 5-minute reconcile sweep will pick this up instead.",
      };
    }
  },
});
