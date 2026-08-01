# Belle Threat Model

- Status: Living document
- Date: 2026-07-31
- Scope: Belle, a textable AI GitHub agent — users converse over iMessage/RCS/SMS
  (via Linq), Belle reviews and fixes GitHub pull requests, and merges only with
  explicit, SHA-bound human approval.
- Inputs: `docs/adr/001-eve-agent-runtime.md`, `docs/adr/002-linq-messaging.md`,
  `docs/adr/003-openai-auth-and-inference.md`, `docs/adr/004-vercel-platform.md`,
  `docs/adr/005-github-integration.md`.

This enumerates Belle's threat surface, the mitigations already implied or
required by the accepted architecture, and residual risk after those
mitigations. It cites ADR controls rather than re-deriving them.

## Assets

| Asset | Where it lives | Why it matters |
|---|---|---|
| GitHub installation tokens | Minted per-call via `connectGitHubCredentials`, never persisted | Read/write repo access |
| Tenant OpenAI API keys (BYOK) | Convex, AES-256-GCM under `APP_ENCRYPTION_KEY` | Inference spend / exfiltration |
| Linq API key / webhook signing secret | Belle server env | Impersonate Belle, read all conversations |
| `APP_ENCRYPTION_KEY` | Belle server env | Root key for credentials, phone hashing, onboarding HMAC |
| Onboarding links | Convex `onboardingSessions`, HMAC-signed | Binds phone → Belle account → GitHub identity |
| Eve session state | Eve durable session store | History, pending approvals, in-flight tool calls |
| Convex product state | Tenant-owned rows keyed by `userId` | System of record: identity, approvals, audit |
| PR contents/diffs/CI logs | Fetched live from GitHub | Untrusted text that reaches the model context |
| Vercel Sandbox execution | Ephemeral VM per fix run | Where attacker-influenced code executes |
| Merge/push capability | Gated GitHub tools | Most consequential, least reversible action |

## Trust boundaries

```
                              Untrusted world
        (phone network, GitHub public content, arbitrary PR authors)
               │                                    │
   BOUNDARY 1: Linq HMAC             BOUNDARY 2: GitHub / Vercel Connect
   (Standard Webhooks signature)      OIDC-signed forwarded trigger
               ▼                                    ▼
   Linq webhook ingress               Vercel Connect (managed GitHub App)
   (chat-sdk-adapter, raw body)       → forwards to /eve/v1/github
               │ event_id dedup                     │ OIDC verify
               └───────────────┬────────────────────┘
                                ▼
        BOUNDARY 3: Eve agent runtime
        linq channel: session key = linq:<chatId>, auth={principalId,tenantId}
        github channel: dispatch via Convex-backed watch rules
          ┌─────────────────────────┐   ┌────────────────────────────────┐
          │ Reviewer subagents       │   │ code-fixer subagent             │
          │ (read-only GitHub tools) │   │  BOUNDARY 4: Vercel Sandbox      │
          └─────────────────────────┘   │  deny-all egress + GitHub allow │
                                          │  firewall credential brokering  │
                                          │  (token never enters sandbox)   │
                                          └────────────────────────────────┘
        BOUNDARY 5: HITL approval gate
        Eve input.requested (session.waiting) + Convex approval record
        bound to {userId, repo, PR, headSHA, expiry} — both must agree
                                │
                                ▼
        BOUNDARY 6: Convex (tenant-owned rows keyed by userId)
        secrets: OpenAI keys (AES-256-GCM), installationId, approval records
                                │
                                ▼
        BOUNDARY 7: outbound egress
        GitHub API (short-lived installation token) · Linq API (idempotent)
        OpenAI / AI Gateway (OIDC or tenant BYOK key)
```

## Attacker profiles

- **A1 — Unauthenticated network attacker.** Can hit public endpoints
  (webhook ingress, onboarding redemption) or text Belle's number. No
  credentials, no Convex/secret access.
- **A2 — Malicious/compromised PR author.** Controls diff, PR metadata,
  comments, CI config, lifecycle scripts in a repo Belle reviews. No
  installation-token or Convex access.
- **A3 — Supply-chain attacker.** Controls a transitive dependency installed
  in the sandbox (or, separately, in Belle's own build).
- **A4 — Phone-adjacent attacker.** SIM swapper, carrier insider, or finder
  of an unlocked phone; can send/receive texts as a real user.
- **A5 — Insider / compromised deployment.** Read access to Belle's Vercel
  project or Convex admin. Out of scope for most controls; noted where
  defense-in-depth applies.
- **A6 — Legitimate tenant, bad faith or error.** Authenticated user probing
  cross-tenant boundaries, flooding, or giving a rushed/ambiguous approval.

## Table of contents

1. [Spoofed Linq webhook](#1-spoofed-linq-webhook)
2. [Spoofed GitHub event](#2-spoofed-github-event)
3. [Stolen onboarding link](#3-stolen-onboarding-link)
4. [Phone-number reassignment](#4-phone-number-reassignment)
5. [SIM swap](#5-sim-swap)
6. [Lost phone](#6-lost-phone)
7. [Prompt injection through code](#7-prompt-injection-through-code)
8. [Prompt injection through PR comments/descriptions](#8-prompt-injection-through-pr-commentsdescriptions)
9. [Malicious pull request](#9-malicious-pull-request)
10. [Token exfiltration](#10-token-exfiltration)
11. [Cross-tenant access](#11-cross-tenant-access)
12. [Unauthorized merge](#12-unauthorized-merge)
13. [Replayed approval](#13-replayed-approval)
14. [Ambiguous approval ("yes" to what?)](#14-ambiguous-approval-yes-to-what)
15. [Head SHA changing after approval](#15-head-sha-changing-after-approval)
16. [Compromised dependency](#16-compromised-dependency)
17. [Sandbox escape](#17-sandbox-escape)
18. [Malicious lifecycle script](#18-malicious-lifecycle-script)
19. [Excessive inference spending](#19-excessive-inference-spending)
20. [Message flooding / SMS pumping](#20-message-flooding--sms-pumping)
21. [GitHub installation revocation mid-run](#21-github-installation-revocation-mid-run)
22. [OpenAI authorization revocation](#22-openai-authorization-revocation)
23. [Vercel connector detachment](#23-vercel-connector-detachment)
24. [Eve session confusion](#24-eve-session-confusion)
25. [Approval attached to the wrong session](#25-approval-attached-to-the-wrong-session)
26. [Summary risk matrix](#summary-risk-matrix)

---

## 1. Spoofed Linq webhook

**Description.** A forged POST to Belle's Linq ingress route, crafted as a
fake `message.received` (or other) event to inject fake user messages or
resolve pending approvals as an impersonated tenant.

**Attack path.** A1 posts a crafted JSON body to the public ingress URL
without holding Linq's signing secret, hoping Belle trusts it.

**Impact.** Impersonation of any phone number, including resolving to a real
tenant and answering a pending HITL approval or triggering repo actions.

**Mitigations.** `chat.webhooks.linq(request)` performs Standard Webhooks
HMAC-SHA256 verification on the **raw** body (no parsing middleware ahead of
it), with a 5-minute replay window and constant-time compare against
`webhook-signature`. Any secondary ingress route uses
`client.webhooks.unwrap`. Legacy `X-Webhook-*` headers are never trusted.
Inbound dedup on `event_id` blocks replay of a captured valid event.

**Residual risk.** Low-medium — sound if the raw body genuinely reaches the
verifier unmodified; a future refactor adding body-parsing middleware could
silently break this. The signing secret is retrievable only once at
subscription creation, so a leak is permanent until rotation (delete +
recreate).

**Recommended controls.** CI integration test that POSTs a validly signed
fixture and a tampered one through the deployed route. Secret-manager
storage with access logging. Alert on ingress signature-rejection spikes.

## 2. Spoofed GitHub event

**Description.** A forged event aimed at `/eve/v1/github` to trigger a
phantom review/fix or desync Convex's PR state.

**Attack path.** A1 posts directly to `/eve/v1/github` mimicking a GitHub
webhook payload.

**Impact.** Wasted review/fix cycles, spend, or state desync if trusted.

**Mitigations.** Belle never receives raw GitHub webhooks — Vercel Connect
verifies them with the GitHub App secret (never held by Belle) and re-signs
the forwarded trigger with a Vercel OIDC signature, which Belle's route
verifies. No `GITHUB_WEBHOOK_SECRET` exists in Belle's environment. Every
tool `execute` re-derives `tenantId` from session and checks repo membership
before acting.

**Residual risk.** Low. Main exposure is Connect as a single trust point
(see #23) and possible bugs in OIDC verification (expired/wrong-audience
token accepted).

**Recommended controls.** CI test asserting rejection of missing/expired/
wrong-audience OIDC tokens. Monitor Connect health; alert on forwarded-
trigger verification failures.

## 3. Stolen onboarding link

**Description.** An intercepted or forwarded onboarding link lets someone
other than the intended user complete account/GitHub linkage.

**Attack path.** A1/A4 obtains a link via interception, forwarding, or a
leaked ticket and opens it before the real recipient.

**Impact.** Attacker completes onboarding bound to the wrong identity, or
the real user's future texts route into an attacker-influenced account.

**Mitigations.** Links are HMAC-signed (`APP_ENCRYPTION_KEY`), short-lived,
single-use, and bound to `linqChatId` + phone hash — redemption from a
different chat fails the binding check, and completion writes back into the
originating chat only.

**Residual risk.** Medium. The chat-binding doesn't protect against an
attacker with access to the *same* chat (synced iMessage across devices) or
one racing the real user within the TTL window.

**Recommended controls.** Require a live "reply CONFIRM in this chat" step
before finalizing GitHub linkage. Keep TTL minutes, not hours; invalidate
outstanding links on first redemption. Alert on redemption from anomalous
IP/user-agent patterns.

## 4. Phone-number reassignment

**Description.** A recycled phone number is reassigned to a new subscriber
who may receive Belle's texts, including pending approvals, meant for the
prior owner.

**Attack path.** A4 (new legitimate number holder) receives and replies to
an in-flight Belle conversation addressed to the prior owner.

**Impact.** Disclosure of repo/PR metadata to an unintended recipient, or an
unauthorized approval answered under the old identity's authorization.

**Mitigations.** Identity keys on the E.164 handle string; phone identity is
layered above GitHub identity in Convex rather than assumed 1:1. Linq
exposes `phone_number.status_updated` as a subscribable signal.

**Residual risk.** High. No described process detects reassignment in real
time or expires a stale phone→user binding; a dormant account's pending
state remains live for whoever now holds the number.

**Recommended controls.** Re-verification challenge after long dormancy
before any side-effecting tool runs. Auto-expire pending approvals (see
#13). Act on `phone_number.status_updated` by pausing the account.

## 5. SIM swap

**Description.** An attacker ports a victim's number to their own SIM and
receives all subsequent Belle traffic as the victim.

**Attack path.** A4 completes a SIM swap; texting Belle resumes the victim's
durable session and treats the attacker as the authenticated principal.

**Impact.** Full impersonation for the swap's duration — approve merges,
request fixes, extract repo information.

**Mitigations.** Session/tenant binding is derived once at first contact
from phone identity, by design; onboarding-link controls (#3) raise the bar
for *initial* takeover but do nothing post-onboarding.

**Residual risk.** High, and largely inherent to phone-number-as-identity —
the largest single identity risk in the architecture. No described
secondary factor survives a swap.

**Recommended controls.** Step-up verification (GitHub-authenticated
dashboard confirmation) for merge/push-class approvals on higher-risk repos.
Notify the linked GitHub email on every high-consequence approval. Support a
dashboard "pause my account" reachable without phone possession.

## 6. Lost phone

**Description.** A finder of an unlocked/weakly-locked phone converses with
Belle as the legitimate user without any carrier-level compromise.

**Attack path.** A4 opens Messages and answers pending approvals or issues
new requests.

**Impact.** Same class as #5, bounded by device lock-screen/notification
settings and typically shorter exposure.

**Mitigations.** None Belle-specific; device security is outside Belle's
control, and "message arrives from this chat" is sufficient to resume by
design.

**Residual risk.** High, same root cause as #5 with a lower attacker bar.

**Recommended controls.** Same as #5: step-up verification for
high-consequence approvals via a channel other than the phone; a
dashboard-reachable pause/sign-out control.

## 7. Prompt injection through code

**Description.** Repository file contents engineered to be read by the
model as instructions rather than data, attempting to override policy.

**Attack path.** A2 commits text like a fake "SYSTEM" instruction inside a
comment, string, or a file Belle is likely to open during review.

**Impact.** Could bias the model's narrative or attempt an unapproved tool
call; could not, by itself, execute an irreversible action.

**Mitigations.** High-consequence tools gate on `approval` policies
evaluated in tool `execute` code, independent of model narrative — injected
text can influence what the model *attempts*, not what the policy
*authorizes*. Reviewer subagents hold only read-only tools. `code-fixer`
runs in a deny-all-egress sandbox with GitHub-only allow-list.

**Residual risk.** Medium. Approval gating blocks direct irreversible
action, but injection can still degrade the quality of moderate-tier actions
or bias Belle's *recommendation*, which a human may trust.

**Recommended controls.** Delimit untrusted content explicitly in model
context as data, not instructions. Add `evals/prompt-injection.eval.ts` with
planted payloads as a deployment gate. Flag "instructions to an AI" patterns
in PR content when rendering summaries to the human.

## 8. Prompt injection through PR comments/descriptions

**Description.** Same technique as #7 via PR/issue metadata — lower
friction since it needs only a comment, not a code change.

**Attack path.** A2 (or any commenter with access to a public repo Belle
watches) posts injected instructions in a title, description, or comment
ingested by `ci-investigator`/review subagents.

**Impact.** Same class as #7; broader attacker set (any commenter, not just
push-rights holders).

**Mitigations.** Same structural protections as #7 (code-gated approval,
subagent tool isolation). GitHub @mention conversations are already a
distinct, lower-trust event type in the channel dispatch.

**Residual risk.** Medium, arguably higher than #7 due to attacker breadth
and edit-after-ingestion (TOCTOU re-injection) potential.

**Recommended controls.** Same delimiter/eval mitigations, extended to
comment fixtures. Annotate non-maintainer commenter content as lower trust
in model context. Rate-limit reprocessing of edited comments.

## 9. Malicious pull request

**Description.** A PR engineered end-to-end to look benign while embedding
a payload that manifests once checked out/run, or once merged.

**Attack path.** A2 opens a PR with environment-sniffing build steps or a
subtly altered security-relevant change that automated review may miss.

**Impact.** Wasted sandbox/CI resources up to a malicious change landing if
human review is fooled by Belle's assessment.

**Mitigations.** `code-fixer` only executes inside deny-all-egress sandbox
with GitHub allow-list. Merges require both Eve HITL approval and a Convex
record bound to `{user, repo, PR, headSHA, expiry}`. Head-SHA invalidation
(#15) prevents a post-approval mutation from riding an earlier approval.

**Residual risk.** Medium. Sandboxing protects Belle's infrastructure and
prevents unattended merges, but a convincing automated review can bias a
rushed human's manual approval — a risk-transfer problem, not a technical
bypass.

**Recommended controls.** Explicitly state review scope/limits alongside
positive recommendations ("sandboxed, no network egress; not audited for
prod-only logic bombs"). Surface heuristic flags (obfuscated code, base64
payloads, env-sniffing conditionals) alongside the LLM's own judgment.

## 10. Token exfiltration

**Description.** A GitHub installation token, tenant OpenAI key, or Linq key
being read, logged, or transmitted somewhere an attacker can retrieve it.

**Attack path.** (a) sandboxed/injection-influenced code tries to read the
installation token from env/fs; (b) a logging bug prints a decrypted secret;
(c) sandboxed code scans `process.env` and tries to exfiltrate over network.

**Impact.** Installation-token theft grants short-lived tenant GitHub
access; OpenAI-key theft enables billed spend abuse; Linq-key theft would be
catastrophic (all-tenant read/send).

**Mitigations.** Installation tokens never enter the sandbox — firewall
credential brokering injects them only at egress, so (a) has nothing to
read. Deny-all-with-GitHub-allow-list network policy blocks (c) even if a
token were present. OpenAI keys are AES-256-GCM at rest and decrypted only
server-side, per ADR 004 never appearing in prompts/tool results/client
code. Tokens are short-lived and minted per call. No long-lived GitHub
secret exists in Belle's environment at all.

**Residual risk.** Low-medium. Belle's own server process still holds
decrypted secrets in memory when using them — inherent, not a gap. Log
hygiene (accidental logging of a decrypted secret) is an easy-to-introduce
bug class with no described control.

**Recommended controls.** Secret-redaction logging middleware, deny-by-
default for fields named key/token/secret/authorization. CI grep/static
check for decrypted-secret variables reaching log/trace calls.
`APP_ENCRYPTION_KEY` rotation schedule with re-encryption migration.

## 11. Cross-tenant access

**Description.** A bug or exploited gap causes Belle to act on or expose
data belonging to a tenant other than the authenticated session's.

**Attack path.** A6/A1 crafts input hoping a tool trusts a supplied
`repositoryFullName`/`installationId` instead of session-derived identity,
or exploits a session-key collision (#24).

**Impact.** Disclosure of another tenant's repo/PR/approval data, or an
unauthorized write/merge against it.

**Mitigations.** `tenantId` is derived exclusively from
`ctx.session.auth.current`, never model input — stated as an explicit design
rule, not per-tool discretion. Every tool refuses repos absent from the
tenant's own `repositories` table. Approval policies re-check repo
membership independently. `evals/cross-tenant.eval.ts` is a deployment gate.
Convex data is tenant-owned rows keyed by `userId`.

**Residual risk.** Low — the most thoroughly defended threat here (explicit
rule + double-check + CI gate). Remaining risk is human error in a future
tool implementation forgetting the rule.

**Recommended controls.** CI grep-based check failing the build if a new
tool references `installationId`/`repositoryFullName` from input without
also referencing `ctx.session.auth`. Extend the cross-tenant eval with every
new tool as a PR checklist item.

## 12. Unauthorized merge

**Description.** A merge/push/write happens without a legitimate, current,
correctly scoped human approval.

**Attack path.** A race between approval and re-validation (#15), a
replayed stale approval (#13), an ambiguous "yes" resolving the wrong
request (#14), session confusion (#24/#25), or an approval-policy bug.

**Impact.** The highest-impact outcome in this document — an irreversible
write to a tenant repo without genuine authorization.

**Mitigations.** Layered by design: (1) Eve `approval` policy checks tenant
pinning → Convex autonomy/policy → allow/deny/`"user-approval"`; (2) on
`"user-approval"` the turn parks until the specific pending request
resolves; (3) the tool's `execute` **independently re-validates** the Convex
approval record — head SHA, expiration, scope — after Eve's resolution;
"approval is a gate, not authorization" (ADR 001). (4) Head-SHA binding
(#15) invalidates stale approvals.

**Residual risk.** Low-medium given the depth of design, but this is the
threat where continuous verification matters most given impact ceiling —
the double-gate only holds if every future high-consequence tool implements
both halves.

**Recommended controls.** Shared, tested helper for Convex re-validation
(not hand-rolled per tool), enforced by CI on every tool tagged
high-consequence. Synthetic canary in staging: attempt a merge with
mismatched SHA/expired approval on every deploy, gate release on rejection.
Distinct alertable audit event for "Eve approved but Convex denied"
near-misses.

## 13. Replayed approval

**Description.** Reuse of a previously granted approval — same or different
action — after it should no longer be valid.

**Attack path.** A6 or a bug replays an earlier "approve" message, or
resolves a new pending request using stale state from an already-resolved
one.

**Impact.** Unauthorized action against stale authorization; overlaps #12.

**Mitigations.** Convex approval records carry an explicit **expiry** and
are bound to `{user, repo, PR, headSHA}` — cannot be replayed against a
different PR/repo, after expiry, or after the head SHA moves. Eve's own
pending-request resolution is one-shot; a second "approve" with no matching
pending request is a no-op.

**Residual risk.** Low. The open question is the actual expiry duration —
too generous widens the practical replay window.

**Recommended controls.** Document and enforce a short expiry (15-30 min)
for merge/push approvals. Log every validation outcome, including
expiry-driven denials, so replay attempts are visible and countable.

## 14. Ambiguous approval ("yes" to what?)

**Description.** A short affirmative reply could plausibly resolve more
than one pending item, or be misread as approval for something the user
didn't mean to approve.

**Attack path.** Primarily A6 acting in good faith but imprecisely; a
sophisticated A2 could try to time an injected recommendation (#7/#8) so an
imprecise "yes" gets misapplied.

**Impact.** A human approves something other than intended — most dangerous
for merge/push.

**Mitigations.** Eve's parked-turn model serializes: a session parks on one
`input.requested` at a time, and "unrelated text is held and replayed after
the approval is answered" — a "yes" resolves only the one pending request in
that session, by construction, not by a separate matching step.

**Residual risk.** Medium. Serialization removes *multiple-simultaneous-
pending* ambiguity, but not the common case of a user replying "yes" to what
they believe is a different, earlier question — Eve resolves what's actually
pending, which may not match the human's mental model.

**Recommended controls.** For merge/push-class approvals, require a
content-bound confirmation ("Reply APPROVE <id> to merge PR #123") rather
than bare yes/no. Always restate what's being approved (repo, PR, SHA
prefix, action) immediately before parking. Add a re-confirmation cooldown
if the pending request has been open long enough to lose context.

## 15. Head SHA changing after approval

**Description.** Between approval and execution, the PR's head commit
changes (new push, force-push, race), so the content actually merged is not
what was reviewed.

**Attack path.** A2 pushes a new (potentially malicious) commit immediately
after approval-request but before execution, hoping the merge lands the
unreviewed content.

**Impact.** Content never actually reviewed gets merged — defeats the
approval gate's purpose entirely.

**Mitigations.** Stated explicitly: "Head SHA changes invalidate Belle
approvals (enforced in Convex + tool code)." The approval record is bound to
a specific head SHA, and the merge tool's `execute` re-validates it
immediately before acting.

**Residual risk.** Low. Directly named and doubly enforced. Remaining
concerns: silent-refusal UX (no clear "why" told to the user) and a narrow
TOCTOU window given `mergeable_state` is computed lazily by GitHub.

**Recommended controls.** Explicit, clear message on head-SHA mismatch
("PR changed after approval — merge cancelled, want me to re-review?").
Re-poll `mergeable_state` immediately before the merge call, not just after
prior mutations.

## 16. Compromised dependency

**Description.** A dependency of Belle's own codebase (not the tenant
repo) is compromised (malicious maintainer, hijack, typosquat) and executes
with Belle's own production privileges.

**Attack path.** A3 publishes a malicious version pulled into Belle's own
lockfile/build, executing with access to `APP_ENCRYPTION_KEY`, Convex
service credentials, OIDC-derived tokens.

**Impact.** Potentially catastrophic — server-side, entirely outside the
sandbox boundary, with access to every secret Belle's runtime touches.

**Mitigations.** Not explicitly addressed in any ADR beyond implicit
lockfile pinning and the Node 24.x engine pin.

**Residual risk.** High relative to how little is addressed. Unlike every
other major category, this has no named architectural control — a genuine
gap, not just residual risk after mitigation.

**Recommended controls.** Reviewed, non-auto-merged dependency bumps,
especially for packages with install/build scripts. `npm audit`/provenance
scanning as a CI gate for Belle's own production tree, distinct from
sandboxed tenant-dependency handling (#18). Least-privilege the runtime's
own credentials (scoped Convex keys, OIDC audiences) to bound blast radius.

## 17. Sandbox escape

**Description.** Attacker-influenced code in a fix run attempts to break
sandbox isolation to reach Belle's host, other tenants' sandboxes, or
network beyond the allow-list.

**Attack path.** A2/A3-controlled code exploits a hypervisor/container
vulnerability or a credential-brokering bug to escape the boundary.

**Impact.** If successful: access beyond intended isolation, worst case
reaching the token-brokering mechanism or other tenants' sessions.

**Mitigations.** Vercel Sandbox provides ephemeral **VM**-level isolation
(stronger than container-only), with vCPU/memory limits and execution
timeouts. Deny-all-by-default network with GitHub-only allow-list bounds
what an escape can reach even on the network path. Firewall credential
brokering means no token is present in the sandbox to steal. Sandboxes are
per-session and fresh per fix run — no persistent state to pivot from.

**Residual risk.** Medium. Isolation is a third-party platform guarantee
Belle inherits without independent verification or a described fallback for
a Vercel Sandbox 0-day. Blast radius is well-minimized even assuming escape
is eventually possible.

**Recommended controls.** Document Vercel Sandbox's isolation guarantees
from vendor security docs and track as a named vendor-dependency risk.
Scope the GitHub allow-list to specific hosts, not broad wildcards.
Periodic (not just pre-deploy) canary tests attempting escape-shaped
behavior.

## 18. Malicious lifecycle script

**Description.** A malicious `postinstall`/`prepare` script, a repo-tracked
git hook, or a test-setup file executes automatically the moment Belle runs
routine tooling (`npm install`, checkout, `npm test`) in the sandbox.

**Attack path.** A2 adds a dependency (or modifies `package.json`) with a
malicious lifecycle hook, relying on Belle's normal fix-run workflow to
trigger it without any explicit review step.

**Impact.** Same execution-context impact as #9, but the highest-*likelihood*
trigger of all sandbox threats — it fires on routine tooling, not just
adversarial paths.

**Mitigations.** Same containment as #17: deny-all egress + GitHub allow-
list, no token present, ephemeral per-run VM. The design correctly contains
rather than tries to prevent this, since running project tooling is the
fixer subagent's normal job.

**Residual risk.** Medium — identical control set to #17, weighted by much
higher likelihood of firing at all (essentially every `node_modules`-
touching fix run).

**Recommended controls.** `--ignore-scripts` by default, selectively
allow-listing lifecycle scripts for known-good provenance packages.
Aggressive, install-phase-specific sandbox timeouts distinct from
build/test. Extend #17's canary suite with lifecycle-hook-shaped payloads
specifically.

## 19. Excessive inference spending

**Description.** Runaway or abusive model spend — billed to a BYOK tenant's
own key, or to Belle's AI Gateway account for non-BYOK tenants.

**Attack path.** A6/A1 sends high message volume, requests repeated
large-context reviews, or exploits a tool-call retry loop.

**Impact.** BYOK: tenant's own OpenAI bill spikes, possibly unnoticed until
invoice. Non-BYOK: cost lands on Belle's own account — direct business risk.

**Mitigations.** BYOK spend limits are the tenant's own OpenAI account
controls, which Belle surfaces rather than reimplements. Non-BYOK is billed
to Belle's own Gateway account, giving Belle direct incentive to meter it.
Inbound `event_id` dedup prevents webhook-retry-driven duplicate inference.

**Residual risk.** Medium-high. No ADR describes an internal per-tenant
rate limit, session-level token budget, or cost-anomaly alerting — weak for
a product built to run unattended for days via durable sessions and cron.

**Recommended controls.** Convex-tracked per-tenant daily token/cost budget
(soft warning + hard stop), tiered by plan. Circuit breaker on tool-call
retry loops and schedule-triggered runs specifically. Proactive spend
visibility to the tenant over Linq at 50%/90% thresholds.

## 20. Message flooding / SMS pumping

**Description.** High inbound message volume toward Belle's number, or
Belle triggered to send high outbound volume, exhausting Linq
rate-limits/spend or degrading service.

**Attack path.** A1/A4 floods inbound messages (real or spoofed, #1), or
attempts to trigger onboarding-style outbound sends toward arbitrary
numbers.

**Impact.** Linq cost/rate-limit exhaustion, degraded responsiveness, or
toll/SMS-pumping-style abuse if outbound triggering toward arbitrary numbers
is possible.

**Mitigations.** Signature verification (#1) means forged webhook volume
requires a valid secret; genuine flooding must go through Linq's own
carrier-level throughput. Outbound idempotency keys prevent Belle's own
retries from amplifying sends. Compliance gate (`chat.health_status` check +
inbound `STOP`-keyword scan) bounds continued messaging to unwilling
recipients.

**Residual risk.** Medium. No described application-level per-chat/per-number
inbound rate limiting before triggering a new LLM turn (overlaps #19).
Whether Belle could be used as an onboarding-message relay toward
unconsented numbers isn't clearly ruled out.

**Recommended controls.** Per-chat/per-number token-bucket rate limiting
before triggering a new Eve turn. Gate any flow that sends a first/
onboarding message behind an authenticated trigger (dashboard, GitHub-
authenticated), never unauthenticated input alone. Alert on per-tenant
message-volume anomalies vs. baseline.

## 21. GitHub installation revocation mid-run

**Description.** A tenant uninstalls the GitHub App (or it's revoked)
while a fix run, review, or pending approval is in-flight.

**Attack path.** Primarily availability/correctness (A6 uninstalling, or
ordinary hygiene); A2 could trigger it deliberately if they had installer
rights, to leave a repo mid-fix.

**Impact.** A fix run fails partway, an approval sits pending against a
revoked repo, or a sandbox process hits unhandled credential-broker errors.

**Mitigations.** Uninstall arrives as an OIDC-verified `installation` event
and marks the Convex installation `revoked`, disabling watch rules and
notifying sessions on next turn. Per-call, short-lived token minting means
an in-flight operation simply fails its next GitHub call cleanly rather than
continuing with stale broad access. `revokeToken` gives Belle its own
explicit revocation path.

**Residual risk.** Low-medium. Credential lifecycle fails closed correctly,
but product-level cleanup (pending approvals, in-progress sandbox runs) on
revocation isn't described — may just fail at next call rather than being
proactively cancelled.

**Recommended controls.** Proactively cancel in-flight sandbox runs and
expire pending approvals for a revoked installation's repos. Explicit Linq
notification when this happens, rather than a silent stall.

## 22. OpenAI authorization revocation

**Description.** A BYOK tenant's key is revoked, expires, hits a spend cap,
or is rate-limited mid-session.

**Attack path.** Primarily A6's own key management; a compromised OpenAI
account revoking a key mid-session is a plausible griefing vector.

**Impact.** A durable session/scheduled run stalls, or Belle silently falls
back to billing its own account for a tenant who intended BYOK-only.

**Mitigations.** Explicit documented priority: BYOK first, "Belle-managed
via AI Gateway as the default/fallback for tenants without a key, **or if a
BYOK key is invalid/rate-limited/revoked**" — graceful degradation is a
stated design choice, not accidental behavior.

**Residual risk.** Medium. Fallback prioritizes availability, but a tenant
wanting BYOK-only for data-handling reasons (not just cost) has no described
opt-out, and no described notification when a silent fallback occurs.

**Recommended controls.** Per-tenant "BYOK-only, pause instead of fallback"
setting. Always notify the tenant over Linq when a fallback occurs.
Proactive scheduled BYOK key validation rather than purely reactive.

## 23. Vercel connector detachment

**Description.** The Connect GitHub connector or its trigger attachment is
detached, misconfigured, or suffers a platform outage, cutting off webhook
ingestion and token minting for every tenant at once.

**Attack path.** Largely operational; a Vercel-account compromise with
`vercel connect detach` access could deliberately sever integration as
denial-of-service or cover for tampering.

**Impact.** Total, simultaneous loss of GitHub event ingestion and token
minting — single point of failure by design (one connector for all
tenants).

**Mitigations.** Connect is Belle's only GitHub integration by deliberate
choice (no PAT fallback, no day-to-day first-party App key). ADR 005
documents an explicit fallback: first-party GitHub App with the same channel
config, and "the Convex data model is installation-keyed either way, so
migration is a credentials swap, not a schema change." Attach/detach are
deliberate operator actions.

**Residual risk.** Medium. The fallback exists on paper and the data model
supports it, but no drill/runbook/automated failover is described — untested
readiness under incident pressure. No standby redundancy.

**Recommended controls.** Write and periodically rehearse the fallback
migration runbook. Monitor Connect health/webhook-delivery-lag as a
first-class alerted metric. Consider a pre-provisioned, dormant standby
first-party App registration to shorten recovery time.

## 24. Eve session confusion

**Description.** A bug in continuation-token/channel mapping resumes the
wrong Eve session — a message from one tenant's chat processed under
another tenant's session.

**Attack path.** Primarily a correctness/bug risk, not directly attacker-
chosen, but security-relevant the moment it happens since session identity
drives every downstream authorization decision.

**Impact.** Severe if it occurs: effectively a cross-tenant breach (#11)
caused by a routing bug.

**Mitigations.** The continuation token is deterministic and channel-owned:
`linq:<chatId>` with no intermediate lookup table. `auth` (including
`tenantId`) is passed explicitly on every `send()` call, freshly derived
from Convex's phone-identity lookup each turn, not inferred from stale
session state. ADR 002 explicitly flags that group-chat `chat_id` is not
stable across membership changes, identifying the risk even though 1:1 DM is
the primary flow.

**Residual risk.** Low-medium. The deterministic 1:1 mapping is sound for
DMs, and explicit per-turn `auth` means confusion alone can't silently
escalate privilege because tool-layer tenant checks (#11) are independent.
Main gap is the flagged group-chat `chat_id` churn case if group usage
expands.

**Recommended controls.** Re-validate `chat_id` membership against Linq's
current participant list before resuming, if group-chat support is built.
Assert at resume time that `auth.tenantId` matches the tenant on record for
that `chatId` in Convex, failing loudly on mismatch.

## 25. Approval attached to the wrong session

**Description.** A narrower variant of #24 specifically for HITL state: an
approval resolution becomes associated with the wrong session/tenant.

**Attack path.** Same root causes as #24, scoped to the parking mechanism
that gates the system's highest-impact actions.

**Impact.** If it occurred: a merge/push executing under the wrong tenant's
authorization context — among the worst possible outcomes in the system.

**Mitigations.** HITL parking is per-session by construction — the pending
request lives inside the specific session that initiated it, not a shared
queue a routing bug could cross-wire. Even if session routing were confused,
the Convex-record re-validation (#12) is independent of session state
entirely: it re-checks `{user, repo, PR, headSHA}` keyed to the actual
approving user, not "whichever session happened to be parked."

**Residual risk.** Low. Benefits from the same layered design as #12 —
session confusion alone has no direct path to unauthorized merge because
Convex re-validation is a second, non-session-derived check. Residual risk
requires both layers failing simultaneously.

**Recommended controls.** Store and re-validate the originating `userId`
(not just repo/PR/SHA) on the Convex approval record, catching same-tenant
different-user mixups too. Include the session/continuation-token
identifier in the audit event written on approval resolution.

---

## Summary risk matrix

Likelihood and impact are rated pre-mitigation; residual risk reflects the
assessment after existing architectural controls.

| # | Threat | Likelihood | Impact | Residual risk |
|---|---|---|---|---|
| 1 | Spoofed Linq webhook | Medium | High | Low-medium |
| 2 | Spoofed GitHub event | Medium | High | Low |
| 3 | Stolen onboarding link | Medium | Medium | Medium |
| 4 | Phone-number reassignment | Low | High | High |
| 5 | SIM swap | Low-medium | High | High |
| 6 | Lost phone | Medium | High | High |
| 7 | Prompt injection through code | High | Medium | Medium |
| 8 | Prompt injection through PR comments/descriptions | High | Medium | Medium |
| 9 | Malicious pull request | Medium | High | Medium |
| 10 | Token exfiltration | Low | Critical | Low-medium |
| 11 | Cross-tenant access | Low | Critical | Low |
| 12 | Unauthorized merge | Low | Critical | Low-medium |
| 13 | Replayed approval | Low | High | Low |
| 14 | Ambiguous approval | Medium | High | Medium |
| 15 | Head SHA changing after approval | Medium | High | Low |
| 16 | Compromised dependency (Belle's own) | Low | Critical | High |
| 17 | Sandbox escape | Low | High | Medium |
| 18 | Malicious lifecycle script | High | Medium | Medium |
| 19 | Excessive inference spending | Medium | Medium | Medium-high |
| 20 | Message flooding / SMS pumping | Medium | Medium | Medium |
| 21 | GitHub installation revocation mid-run | Medium | Low | Low-medium |
| 22 | OpenAI authorization revocation | Medium | Medium | Medium |
| 23 | Vercel connector detachment | Low | High | Medium |
| 24 | Eve session confusion | Low | Critical | Low-medium |
| 25 | Approval attached to the wrong session | Low | Critical | Low |

### Highest-priority residual risks

1. **SIM swap / phone-number reassignment / lost phone (#4-#6).** Phone
   possession is Belle's root authentication factor, with no step-up factor
   for high-consequence approvals — the largest identity risk in the
   architecture, needing an out-of-band confirmation path for merges and a
   dormancy re-verification trigger.
2. **Compromised dependency in Belle's own runtime (#16).** Unlike every
   other major category, this has no named architectural control at all in
   the ADRs — a genuine gap warranting explicit supply-chain tooling
   (lockfile review discipline, audit gates, provenance checks).
3. **Excessive inference spending (#19).** BYOK spend limits rely entirely
   on the tenant's own OpenAI account; no ADR describes an in-app budget or
   circuit-breaker for durable, unattended, cron-triggered sessions — a
   business-risk gap worth closing before scale.
