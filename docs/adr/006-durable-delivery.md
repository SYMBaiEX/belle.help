# ADR 006: Durable Delivery for Webhook-Triggered Notifications

- Status: Accepted
- Date: 2026-08-01
- Supersedes nothing; extends ADR 001 (Eve owns the agent runtime)

## Context

A real `pull_request` event for `SYMBaiEX/doolittle#2` was received, recorded in
`webhookEvents`, and never produced a text. Two compounding defects:

1. The channel hook launched its work with `void handlePrEvent(...)` and
   returned immediately. Eve awaits these hooks
   (`GitHubInboundResultOrPromise`), so the fire-and-forget promise was killed
   when the serverless invocation ended — after the dedup row was written but
   before the Linq send.
2. The stranded dedup row (state `received`) made every subsequent GitHub
   redelivery look like a duplicate, so the retry that should have rescued the
   notification was discarded too.

Both are fixed. The remaining question: how do we make this class of failure
structurally impossible rather than relying on having found this one?

## Considered: adopt the Vercel Workflow SDK directly

`"use workflow"` / `"use step"` gives durable, independently retried steps that
survive invocation termination, plus `sleep()` — a clean fit for webhook
ingestion, the fix pipeline, and deferred actions.

**Rejected for now: an irreconcilable dependency conflict.**

```
eve                  → @workflow/world-vercel  5.0.0-beta.34 (and world 5.0.0-beta.23)
@github-tools/sdk    → peerOptional workflow  ^4.5.0
workflow@latest      → 4.8.0   (beta channel: 5.0.0-beta.38)
```

Installing `workflow@5.0.0-beta.34` fails `ERESOLVE` against
`@github-tools/sdk`'s `^4.5.0` peer. It could be forced with
`--legacy-peer-deps`, but that leaves `@github-tools/sdk`'s own `workflow`
subpath running against an incompatible major, and Eve's docs explicitly warn
that a mismatched `@workflow/*` protocol version is rejected at initialization.
Forcing a broken resolution to gain reliability would be self-defeating.

Note this is a *direct* dependency decision only. Eve already runs on Workflow,
so every agent conversation turn is durable today; what is not durable is the
channel-hook code that runs before a session is dispatched.

## Considered: let the hook throw so GitHub redelivers

Rejected: Eve's `runInboundHandler` catches hook exceptions, logs them, and
returns normally, so the endpoint still answers `200`. GitHub therefore never
redelivers regardless of what we throw. Retry cannot be delegated upstream.

## Decision

Make delivery at-least-once inside our own boundary, using infrastructure that
already exists:

1. **Record before sending.** `notifyUser` writes an `outboundMessages` row
   (keyed by `idempotencyKey`) before calling Linq. The intent survives even if
   the process does not.
2. **Sweep what never landed.** `agent/schedules/flush-outbound-messages.ts`
   runs every two minutes, finds rows still `queued`/`failed`, and re-sends
   them with bounded attempts and increasing back-off.
3. **Only settled events suppress retries.** `webhookEvents:recordIfNew`
   treats a redelivery as a duplicate only when the prior run reached
   `processed`; a crashed run is allowed to re-run. Handlers settle each event
   with `markProcessed` / `markFailed`.
4. **Await the work.** Channel hooks are `async` and awaited, so the happy path
   completes within the invocation and the sweep stays a safety net rather
   than the primary path.

Re-sending is safe because the message carries both our `idempotencyKey` and
Linq's `idempotency_key`; a replay cannot double-text a user.

## Consequences

- Worst-case notification latency on a failed first attempt is ~2 minutes
  instead of never. The happy path is unchanged and immediate.
- We own retry/back-off logic that Workflow would have provided for free.
- Deferred actions still use the `scheduledActions` table plus cron polling
  rather than `sleep()`.

## Revisit when

`@github-tools/sdk` widens its `workflow` peer to the 5.x line, or Eve and the
Workflow SDK converge on a stable release. At that point the highest-value
conversions, in order: webhook ingestion → the fix pipeline (clone → validate →
push, currently multi-minute work inside one turn) → deferred actions, where
`sleep()` would delete the `scheduledActions` polling subsystem entirely.
