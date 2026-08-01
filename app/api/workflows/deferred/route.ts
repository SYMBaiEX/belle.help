import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { deferredActionWorkflow } from "@/app/workflows/deferred-action";

const bodySchema = z.object({
  actionId: z.string().min(1),
  userId: z.string().min(1),
  kind: z.union([z.literal("watch_expiry"), z.literal("reminder")]),
  runAfter: z.number(),
  repositoryFullName: z.string().min(1).optional(),
  text: z.string().min(1).optional(),
});

/**
 * Starts a durable `deferredActionWorkflow` run. Called by the agent tool
 * `agent/tools/schedule_deferred_action.ts` immediately after enqueuing the
 * corresponding `scheduledActions` row, so the workflow sleeps until the
 * action is due instead of waiting for the 5-minute reconcile sweep.
 *
 * Authenticated with a shared internal secret rather than a user session —
 * the caller is Belle's own agent runtime, not a browser.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_TRIGGER_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Deferred actions are not configured." }, { status: 503 });
  }

  const provided = req.headers.get("x-belle-internal");
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing or malformed body." }, { status: 400 });
  }

  // Invoking this returns once the run is persisted; the steps then execute
  // durably even after this request completes.
  await deferredActionWorkflow(parsed.data);

  return NextResponse.json({ started: true });
}
