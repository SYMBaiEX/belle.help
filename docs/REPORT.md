# Belle — Final Implementation Report

Date: 2026-08-01 · Eve 0.29.4 · Next.js 16 · Convex · Linq Partner API V3

## What was built

A complete, typechecked, building, tested implementation of Belle: a textable
AI GitHub agent. One repository, one Vercel deployment (`withEve()` hosts the
Next.js app and the Eve agent together).

| Area | Delivered |
|---|---|
| Agent runtime | Eve 0.29.4: durable sessions, HITL parking/resume, filesystem-first agent (`agent/`) |
| Instructions & skills | `agent/instructions.md` + 9 skills (text communication, context resolution, PR review, security review, CI investigation, approved fixes, safe merging, prompt-injection resistance, repository policy) |
| Linq → Eve channel | `agent/channels/linq.ts`: official `@linqapp/chat-sdk-adapter` (Standard-Webhooks HMAC + timestamp verification) bridged via Eve's `chatSdkChannel`; one Linq chat ↔ one durable session; Convex-side event dedup; opt-out keyword handling; onboarding gate for unknown numbers (signed, single-use, 30-min links) |
| Direct Linq V3 client | `lib/linq/client.ts`: idempotent sends, tapback reactions, typing, chat health (for features the adapter doesn't expose) |
| GitHub integration | Vercel Connect managed GitHub App; `agent/channels/github.ts` (@mention conversations + PR/CI event ingestion → dedup → watch-rule/filter evaluation → templated Linq notifications → auto-review queue); `@vercel/connect` per-`installationId` short-lived tokens; no App private key anywhere |
| Agent tools | 24 typed tools: 9 read (PR, files, checks, logs, merge-readiness…), 5 moderate (comment, review, reviewer, label, rerun — policy-gated), 2 high-consequence (merge, close — double-gated), 8 product tools (approvals, review/fix runs, audit, watch rules, reactions) |
| Approval safety | Two agreeing layers: Eve `approval` policy (`agent/lib/approval.ts` — tenant pinning → autonomy floor → `"user-approval"`) parks the session; Convex `approvals:consume` re-validates user + action + repo + PR + **head SHA** + expiry + single-use inside `execute` |
| Subagents | code-reviewer, security-reviewer, ci-investigator (read-only, isolated tools, structured findings contracts), code-fixer (own Vercel Sandbox, allow-listed egress, checkout/validate/push tools, no-force-push, remote-head verification) |
| Schedules | 5: daily + weekly digests (Convex fan-out → Linq sessions), watch-rule expiry sweep, GitHub event/auto-review reconciler (5 min), approval expiry (15 min) — all become Vercel Cron Jobs |
| Data | Convex: 19 tables (users, phone identities, onboarding, encrypted credentials, installations, repositories, PRs, review runs/findings, fix runs, approvals, webhook events, outbound messages, audit, memories, usage, notification prefs, conversation contexts, scheduled actions) with tenant-ownership indexes |
| Web | Landing (honest phone-number gating, CSS-only iMessage conversation preview, security/approval/FAQ/legal pages), mobile-first 5-step onboarding (token → account+cookie → AI mode → GitHub install → repos/autonomy → confirmation text), full dashboard (overview, repos, PRs, reviews/findings, fix runs, approvals, settings incl. BYOK key + account deletion, audit log) |
| Security | AES-256-GCM credential encryption, HMAC phone hashing, signed single-use onboarding tokens, signed session cookies, webhook signature + replay protection, event dedup, tenant fail-closed tool layer, sandbox isolation, threat model (25 threats) |
| Evals | 7 Eve evals; merge-safety, approval-safety, prompt-injection, cross-tenant tagged as deployment gates |
| Tests | Vitest unit tests (encryption, onboarding links, env validation + convex-test suites for approval consumption/SHA binding, webhook dedup, context partial-patch, scheduled actions) |
| Docs | ADRs 001–005, threat model, competitive landscape, unit economics, README (setup/deploy/troubleshooting), this report |

## Verification status

- `npm run typecheck` — green (app + agent + convex + tests, strict TS).
- `npm run test` — green.
- `npm run build` — green; all marketing/onboarding/dashboard routes compile;
  Eve agent builds into the same deployment.
- Eve evals — authored; execution requires model credentials
  (`AI_GATEWAY_API_KEY` locally / OIDC on Vercel). Not executed in this
  environment (no AI credentials present).
- Live message flow — **not** exercised end-to-end: no `LINQ_API_KEY`,
  no provisioned phone number, no Vercel project/Connect connector, and no
  production Convex deployment were available in this environment. Every
  integration is real code against documented APIs (no mocks in production
  paths); missing credentials produce explicit, actionable errors.

## What is deployed

Nothing yet — deployment requires owner credentials. The repository is
deploy-ready; `vercel deploy --prod` + the provider steps in
[README → Provider setup](../README.md#provider-setup-owner-credentials-required)
are the complete activation path:

1. `vercel connect create github --triggers` → attach at `/eve/v1/github`;
   set `VERCEL_CONNECT_GITHUB_UID`, `GITHUB_BOT_NAME`,
   `NEXT_PUBLIC_GITHUB_APP_INSTALL_URL`.
2. Linq API token + phone number; webhook subscription →
   `https://belle.help/eve/v1/linq?version=2026-02-03`; set `LINQ_API_KEY`,
   `LINQ_WEBHOOK_SECRET`, `NEXT_PUBLIC_BELLE_PHONE_NUMBER`.
3. `npx convex deploy` (prod) → `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOY_KEY`.
4. `APP_ENCRYPTION_KEY` (`openssl rand -hex 32`).
5. Attach `belle.help`; verify Cron Jobs + Agent Runs; run the eval gates.

## How Linq maps to Eve sessions

Inbound webhook → adapter verifies `webhook-id`/`webhook-timestamp`/
`webhook-signature` (HMAC-SHA256 over `id.timestamp.rawBody`, 5-min replay
window) → Convex `webhookEvents:recordIfNew` drops at-least-once duplicates →
phone hash → Belle user → `send(content, { thread, auth })` where the stable
thread id `linq:{chatId}` is the continuation token, so the same conversation
always resumes the same durable session. Auth stamps
`{ authenticator: "linq", principalType: "user", principalId: userId,
attributes: { tenantId, phoneHash, linqChatId, protocol } }`. Unknown numbers
never reach the model — they get the signed onboarding link.

## How GitHub authorization works

One Vercel Connect connector; each end user installs the managed GitHub App
on their own repos. Installation lifecycle events keep Convex in sync. Tools
call `octokitForTenant(ctx, repoFullName)`: tenant from verified session auth
→ repo must exist in that tenant's Convex config → installation must be
active and owned by the same tenant → short-lived token minted for that
`installationId`. Local dev may fall back to `GITHUB_TOKEN` (documented,
never for production).

## How approval safety works

`create_approval_request` persists the product record (action, repo, PR,
head SHA, prompt, expiry) → the gated tool's Eve `approval` policy returns
`"user-approval"` (session parks durably; the Linq surface renders the
prompt; an unrelated "yes" resolves nothing because Eve holds non-matching
replies) → on resume, `execute` calls `approvals:consume`, which atomically
re-validates user, action, repo, PR, **exact head SHA**, expiry, and
approved-not-yet-consumed status → the merge additionally re-fetches the PR
and aborts if the live head differs, and passes `sha:` to GitHub's merge API
so GitHub enforces it a third time. Autonomy floors (merge requires level 4,
fixes level 3) are enforced in the approval policy; levels never remove the
fresh-approval requirement.

## How sandbox isolation works

Only the code-fixer subagent has a sandbox (`vercel()` backend in
production). Egress allow-list: github.com, *.github.com,
codeload/objects.githubusercontent.com, npm/yarn registries. No production
secrets enter the sandbox; the installation token is interpolated into git
commands just-in-time and never written to disk (interim measure — firewall
credential brokering is the documented production hardening). Lifecycle
scripts are not run blindly (`--ignore-scripts` first); validation commands
are bounded and filtered; pushes verify the remote head and never force.

## ChatGPT subscription-backed execution

**Not supported, and not advertised.** Research against primary OpenAI
documentation (ADR 003) found "Sign in with ChatGPT" is scoped to OpenAI's
first-party Codex surfaces; no public OAuth registration lets a third-party
SaaS consume ChatGPT plan inference; Codex has no delegated multi-tenant
hosting model. The onboarding UI shows this option visibly disabled with an
honest explanation. Supported modes: BYOK OpenAI key (encrypted, masked) and
Belle-managed inference via AI Gateway.

## Credentials still needed (owner)

`APP_ENCRYPTION_KEY` · `LINQ_API_KEY` · `LINQ_WEBHOOK_SECRET` · Linq phone
number · Vercel project + Connect GitHub connector (`VERCEL_CONNECT_GITHUB_UID`,
install URL) · production Convex (`NEXT_PUBLIC_CONVEX_URL`,
`CONVEX_DEPLOY_KEY`) · optional `OPENAI_API_KEY` (managed fallback) ·
optional `AI_GATEWAY_API_KEY` (local dev only).

## Known limitations

1. **Chat SDK state is in-memory** (`@chat-adapter/state-memory`): thread
   subscriptions/locks don't survive serverless instance turnover. DM
   dispatch and Convex-side dedup keep the core loop correct; a Convex-backed
   `StateAdapter` is the planned durable replacement.
2. **Sandbox git credential handling** interpolates the short-lived token
   into git commands rather than using Vercel Sandbox firewall credential
   brokering; hardening documented in the threat model.
3. **Auth is phone-possession only** (signed onboarding link → session
   cookie). Passkeys/magic links/GitHub sign-in are post-MVP; SIM-swap risk
   is the top residual in the threat model — high-consequence approvals should
   gain a dashboard step-up factor.
4. **Evals and live E2E not executed here** (no model/provider credentials in
   the build environment); they are authored and wired as release gates.
5. **Digest/quiet-hours evaluation is UTC-based** at the schedule layer;
   per-user timezone conversion happens in-agent from stored preferences and
   deserves dedicated tests.
6. **Rate limiting is in-memory** per instance (documented); move to Convex
   or an edge-rate-limit product for production scale.
7. **`@github-tools/sdk` presets not used directly** for tool execution:
   its token input can't see Eve session context, so Belle's tenant-scoped
   wrappers mint per-installation tokens instead (ADR 005). The SDK's
   `createOctokit` is reused.
8. **Group chats, voice notes, screenshots, teams/org policy** — post-MVP
   (spec §45); nothing hidden behind fake UI.
9. **Copilot-style GitHub review publishing policies** are enforced at the
   agent/tool layer per repository `reviewPolicy`; a hard server-side gate on
   `submit_review` content classification is future work.


## Operational learnings (2026-08-01, first live day)

Five failures found by running the thing for real. Each was invisible in tests
and obvious only from production evidence.

**1. Convex rejects undeclared arguments — silently, as "Server Error".**
Seven call sites passed fields their validators didn't declare (`receivedAt`,
`createdAt`, a wrong-shaped `markSent`). Because `agent/lib/convex.ts`
addresses functions by string name, TypeScript could not catch any of it. The
first one broke inbound texting completely: the webhook arrived, the mutation
threw, Belle never replied. Guarded now by `tests/unit/convex-call-sites.test.ts`,
which parses every call site — including the `anyApi.mod!.fn!` form used in the
Workflow files, and keys written alongside a spread.

**2. `session.failed` is terminal, and expected errors were reaching it.**
Eve cascades `step.failed → turn.failed → session.failed`, and a dead session
means the next message starts with no history — users read that as amnesia.
Tools were throwing for ordinary conditions ("repository not configured"), so
asking about an unconnected repo destroyed a weeks-long conversation. Expected
conditions now return `{ ok: false, message }`.

**3. Nothing ever wrote to the memory table.** `get_repository_context` read
from `memories`; no code path wrote to it. Combined with compaction, every
stated preference was eventually lost. Belle now has a `remember` tool and
reads memory back in `get_user_context`.

**4. Fire-and-forget work dies with the invocation.** A `void handlePrEvent(...)`
in an awaited eve hook was killed mid-flight after the dedup row was written
but before the notification — and the stranded row then made every GitHub
redelivery look like a duplicate, so the retry that should have rescued it was
discarded. Only a run that reaches `processed` may now suppress a redelivery.

**5. `vercel env pull` masks sensitive values as the literal string
`[SENSITIVE]`.** This silently broke a local Convex CLI invocation and a
credential test, producing errors that looked like auth failures. Never debug
against a pulled env file without checking for that sentinel.

Two smaller ones worth remembering: eve normalizes `GitHubPullRequestEvent.raw`
to the `pull_request` object itself (not the delivery envelope), so
`raw.pull_request` always missed and notifications shipped with placeholder
titles; and eve's build **rejects** `"use step"`/`"use workflow"` anywhere under
`agent/**`, which is why Workflow adoption is confined to the Next.js tree.

A meta-lesson: a guard that passes proves nothing until you have watched it
fail on the case it exists to catch. The Convex guard passed while blind to ten
call sites and to any key following a shorthand property; both gaps surfaced
only from deliberate negative tests.

## MVP checklist vs. spec (§44)

Items 1–33 implemented in code; item 34 (production deployment) blocked on
owner credentials only. Every external configuration step is documented above
and in the README. No mock data stands in for core functionality; where a
credential is absent the system fails with a labeled, actionable error.

## Running the evals

```bash
npm run evals         # all 7, against the deployed agent
npm run evals:gates   # the 4 safety gates only, --strict (non-zero exit on failure)
```

**Evals must target a deployed agent (`--url`), not the local host.** A local
`npx eve eval` boots eve's local Workflow world and every run dies with an
opaque `TypeError` / `USER_ERROR` from the workflow runtime, then times out.
This was bisected and is *not* caused by this repository: it reproduces on
commits predating both the Workflow SDK adoption and the tool-result refactor,
and it is unaffected by the root model (`claude-sonnet-5` fails identically to
`deepseek/deepseek-v4-flash`) and by removing `agent/instrumentation.ts`.
Production is unaffected — the same suite passes fully against `belle.help`.

The leading hypothesis is version skew inside eve's own vendored packages:
`@workflow/core` is pinned at `5.0.0-beta.38` while `@workflow/world-local` is
`5.0.0-beta.32` (`world-vercel`, which production uses, is `5.0.0-beta.34`).
That is a hypothesis, not a proven root cause — the workflow runtime swallows
the stack, so the failure surfaces only as a bare `TypeError`.

Last full run against production — **7 passed / 7, 14 gates passed, judge 100%**:
cross-tenant, approval-safety, intent-resolution, merge-safety,
notification-quality, prompt-injection, smoke.

Note that LLM-judge scores are non-deterministic: `approval-safety` scored 0% on
the judge in one run and 100% in the next, with its hard gates passing both
times. Treat the gates as the release signal and the judge as a trend.
