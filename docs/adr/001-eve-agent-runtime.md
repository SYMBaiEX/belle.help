# ADR 001: Eve as Belle's Agent Runtime

- Status: Accepted
- Date: 2026-07-31
- Eve version at decision time: `eve@0.29.4` (public preview)
- Source of truth: `node_modules/eve/docs/` (installed, version-specific)

## Context

Belle is a textable GitHub operator: users converse over iMessage/RCS/SMS (via Linq),
Belle watches repositories, reviews PRs, fixes approved findings in a sandbox, and
merges only with explicit, SHA-bound approval. This requires durable multi-day
sessions, human-in-the-loop parking, typed tools with approval gates, specialist
subagents, isolated code execution, and cron scheduling.

## Decision

Use Eve as the single agent runtime. Do not build a second runtime around it.

## Why Eve

The installed docs confirm Eve natively provides every runtime primitive Belle needs:

| Belle requirement | Eve primitive (verified in installed docs) |
|---|---|
| Durable sessions across days | Durable session state; `sessionTimeoutMs` default 30 days (`agent-config.md`) |
| Park while waiting for a user | HITL `input.requested` → `session.waiting`, durable pause (`tools/human-in-the-loop.md`) |
| Resume on new text message | Channel `send(message, { continuationToken })` resumes the owning session (`channels/custom.mdx`) |
| Approval before consequential actions | `defineTool({ approval })` with `always()/once()/never()` or async policy returning `"user-approval"`/`approved`/`denied` (`tools/human-in-the-loop.md`) |
| Typed tools | `defineTool` + Zod `inputSchema`; filename = tool name (`tools/overview.mdx`) |
| Skills | `agent/skills/*.md` on-demand procedures |
| Specialist subagents | Declared subagents under `agent/subagents/<id>/` — hard isolation boundary: own instructions, tools, sandbox; inherit nothing (`subagents.mdx`) |
| Sandboxed execution | `defineSandbox` with `vercel()` backend, network policy, credential brokering at firewall (`sandbox.mdx`) |
| Scheduled runs | `agent/schedules/*.ts|.md` → Vercel Cron Jobs (`schedules.mdx`) |
| Evaluations | `evals/*.eval.ts` with `defineEval`, gates vs soft assertions, `mockModel` fixtures (`evals/overview.mdx`) |
| Event streaming | `GET /eve/v1/session/:id/stream` NDJSON |
| Multi-channel | First-class GitHub channel + Chat SDK bridge + custom `defineChannel` |
| Observability | `agent/instrumentation.ts`, OpenTelemetry, Vercel Agent Runs |

## Responsibility split: Eve vs Convex

**Eve owns (runtime state):**
- Session lifecycle, turn execution, checkpointed workflow steps
- HITL pause/resume protocol and pending-input requests
- Conversation history, compaction, token budgets
- Subagent dispatch, sandbox lifecycle, schedule dispatch

**Convex owns (product state):**
- Users, phone identities, onboarding sessions, encrypted credentials
- GitHub installations, repositories, watch rules, autonomy levels
- PR snapshots, review runs, findings, fix runs
- **Product-level approval records** (Eve approval state is runtime state; the
  Convex approval record is the product/audit record — both must agree before a
  high-consequence action executes; see `patterns/multi-tenant-approvals.md`
  which explicitly recommends application-owned approval records for
  policy-grade approvals)
- Audit events, usage, billing, notification preferences, structured memory

Eve's transcript is never the application database; Convex is never a session store.

## Linq message → identity → session mapping

Belle implements Linq as a custom channel (`agent/channels/linq.ts`, `defineChannel`):

1. Linq webhook POSTs to the channel route; the route verifies the event (ADR 002).
2. The route resolves the phone identity → Belle user in Convex.
3. The continuation token is channel-owned. Belle uses `linq:<chatId>` as the
   channel-local raw token, so one Linq conversation maps to one durable Eve
   session. Eve prepends the channel namespace automatically.
4. `send(text, { auth, continuationToken })` starts or resumes the session. `auth`
   carries `{ authenticator: "linq", principalType: "user", principalId: <userId>,
   attributes: { tenantId: <userId>, phoneHash, protocol } }` following the
   multi-tenant auth pattern (`patterns/multi-tenant-auth.md`).
5. Outbound: the channel's `message.completed` event handler delivers the reply
   through the Linq API with an idempotency key.

Unonboarded numbers get a minimal "onboarding" session whose only capability is
sending the signed onboarding link.

## GitHub webhooks → sessions

The Eve GitHub channel (`channels/github.mdx`) receives Connect-forwarded webhooks
at `/eve/v1/github` with OIDC signature verification. Belle's config:
- `onPullRequest` / `onCheckSuite` / `onCheckRun` / `onWorkflowRun` hooks decide
  dispatch. For PR notifications the hook records the event in Convex and, when
  watch rules match, uses cross-channel handoff (`args.receive(linq, …)` /
  `channel.receive`) to notify the user in their existing Linq session, rather
  than opening a GitHub-comment conversation.
- Direct @mention conversations on GitHub remain available via the channel's
  default comment dispatch.

## Approvals: park and resume

High-consequence tools (`push_approved_changes`, `merge_pull_request`,
`submit_review`, …) declare `approval` policies. The policy:
1. Verifies tenant pinning (`session.auth.current` vs `initiator`).
2. Consults Convex autonomy/policy for the repository (deny / allow / `"user-approval"`).
3. On `"user-approval"`, Eve emits `input.requested`; the turn parks at
   `session.waiting`. The Linq channel renders the approval as a text prompt.
4. A reply matching an option (or `approve`/`deny`) resolves the request; the run
   resumes exactly where it parked. Unrelated text is held and replayed after the
   approval is answered (documented Eve behavior — this is what makes an
   unrelated "yes" safe: it resolves only a pending request in the same session).
5. The tool `execute` then re-validates the Convex approval record (head SHA,
   expiration, scope) before acting — approval is a gate, not authorization.

## Subagent isolation

Declared subagents (`code-reviewer`, `security-reviewer`, `ci-investigator`,
`code-fixer`) inherit nothing: each has only its own `instructions.md`, `tools/`,
and `sandbox/`. Reviewers get read-only GitHub tools; only `code-fixer` has a
sandbox configured for repo checkout, with `deny-all`-by-default network policy
plus a GitHub allow-list and firewall credential brokering so the installation
token never enters the sandbox.

## Sandbox runs

`ctx.getSandbox()` inside code-fixer tools; backend `vercel()` in production,
`defaultBackend()` locally. Per-session sandboxes are keyed to the durable
session; Belle treats each fix run as its own delegated subagent session so the
workspace is fresh per fix. Egress policy and credential brokering per ADR 005.

## Schedules

`agent/schedules/*.md|ts` (root-only) → Vercel Cron Jobs (UTC). Handler-form
schedules use `receive(linq, …)` with `appAuth` for digests and reminders;
markdown task-mode schedules handle reconciliation/cleanup sweeps. Dev testing
via `POST /eve/v1/dev/schedules/<id>`.

## Agent Runs for debugging

Vercel Agent Runs shows each session's steps, tool calls, and model usage.
It is treated as a debugging surface only; Belle persists its own audit events
in Convex because Agent Runs retention is not a permanent audit log.

## Public-preview risk and fallbacks

Eve is in preview; APIs may change before GA. Mitigations:
- Pin `eve@0.29.4`; upgrade deliberately with the changelog.
- All product state lives in Convex, so a runtime migration loses at most
  in-flight conversations, not user data, approvals, or audit history.
- The Linq channel is a thin `defineChannel` adapter (~1 file); if a channel API
  changes, only that file changes.
- If a capability regresses, the fallback is the documented Eve HTTP API
  (`POST /eve/v1/session`, continuation tokens, stream) driven from Next.js
  routes — still Eve, no second runtime.

## Node/AI SDK requirements

- Node 24.x (`engines` in scaffold), AI SDK `ai@^7`.
- Model config via AI Gateway id strings (`defineAgent({ model })`), dynamic
  per-session model selection available via `defineDynamic` for BYOK users
  (ADR 003).
