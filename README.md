# Belle — Your GitHub agent is one text away

Belle is an AI GitHub operator you reach over iMessage, RCS, or SMS. Text her
number, connect GitHub, and she watches your repositories, reviews pull
requests, investigates CI, fixes approved issues in an isolated sandbox, and
merges only with your explicit, SHA-bound approval.

Text Belle. Connect GitHub. Review, fix, and ship pull requests from anywhere.

**Live:** [belle.help](https://belle.help) · text **+1 (213) 524-6010**

Belle is **invite-only** during early access. Your first text puts you in the
approval queue and sends a setup link — you can connect GitHub and pick
repositories while you wait, so you're ready the moment you're approved. If you
have an invite code, redeem it during setup and you're live immediately.

## Access flow

```
first text ──▶ access request created ──▶ "you're on the list" + setup link
                     │                              │
                     │                    user completes onboarding
                     │                    (GitHub, repos, autonomy)
                     ▼                              │
            admin approves at /admin ───▶ "You're approved! Chat away"
                     │                              │
                     └──────── or ──────────────────┘
                        invite code redeemed → instant approval
```

Until approved, a number never reaches the model (reminders are throttled to
once per 12h) and the agent's approval policy denies every external action, so
an unapproved account cannot touch GitHub even through the dashboard.

## Architecture (one paragraph)

One Vercel deployment hosts both the Next.js app (marketing, onboarding,
dashboard) and the [Eve](https://eve.dev) agent via `withEve()`. Messaging is
[Linq Partner API V3](https://docs.linqapp.com) bridged into Eve through the
official `@linqapp/chat-sdk-adapter` + Eve's Chat SDK channel — one Linq
conversation maps to one durable Eve session. GitHub access is the Vercel
Connect managed GitHub App (short-lived per-installation tokens, OIDC-verified
webhook forwarding to `/eve/v1/github` — no App private key held). Product and
audit data live in Convex. Code changes run in the code-fixer subagent's
Vercel Sandbox with an allow-listed network policy. High-consequence actions
(push, merge, close) are doubly gated: an Eve HITL approval parks the session
AND a Convex approval record bound to user + repo + PR + head SHA + expiry is
consumed inside the tool — both must agree.

```
Phone ⇄ Linq ⇄ /eve/v1/linq (signature-verified) ⇄ Linq Eve channel ⇄ durable session
GitHub ⇄ Vercel Connect ⇄ /eve/v1/github (OIDC-verified) ⇄ notifications + auto-review queue
Session ⇄ tools (tenant-pinned) ⇄ Convex (product/audit) + GitHub API (Connect tokens)
Fixes  ⇄ code-fixer subagent ⇄ Vercel Sandbox (clone → edit → validate → push)
```

Key docs: [ADRs](docs/adr/) · [threat model](docs/security/threat-model.md) ·
[competitive landscape](docs/research/competitive-landscape.md) ·
[unit economics](docs/research/unit-economics.md) ·
[final report](docs/REPORT.md)

## Repository layout

```
agent/            Eve agent: instructions, channels (linq/github/eve), tools,
                  skills, subagents (code-reviewer, security-reviewer,
                  ci-investigator, code-fixer + sandbox), schedules, otel
app/              Next.js: landing, onboarding, dashboard, API routes
convex/           Schema + functions (users, repos, PRs, reviews, approvals,
                  audit, webhook dedup, scheduled actions…)
lib/              Shared: encryption, env validation, onboarding links,
                  session cookies, Linq V3 client, tenant GitHub helper
evals/            Eve evals (merge-safety & friends are deployment gates)
tests/            Vitest unit tests
docs/             ADRs, research, security, report
```

## Local setup

Requirements: Node 24.x, npm.

```bash
npm install
cp .env.example .env.local          # fill in at least APP_ENCRYPTION_KEY
openssl rand -hex 32                # → APP_ENCRYPTION_KEY
npx convex dev                      # local Convex (anonymous mode works)
npm run dev                         # Next.js + embedded Eve agent
# or: npm run eve:dev               # Eve TUI/REPL against the agent alone
```

Without `LINQ_API_KEY` / Connect configured, the integrations degrade with
clear errors; the agent REPL, dashboard, unit tests, and evals still run.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js + Eve (withEve) |
| `npm run eve:dev` | Eve dev server + REPL |
| `npm run typecheck` | `tsc --noEmit` across app/agent/convex/tests |
| `npm run test` / `test:watch` | Vitest unit tests |
| `npx eve eval` | Eve eval suite (needs model credentials) |
| `npx convex codegen` | Regenerate Convex types (`CONVEX_AGENT_MODE=anonymous` for offline) |

## Provider setup (owner credentials required)

### 1. Linq
1. Get a Partner API token: dashboard.linqapp.com/api-tooling → Generate token
   → `LINQ_API_KEY`. Provision a phone number (Linq sales/dashboard) →
   `NEXT_PUBLIC_BELLE_PHONE_NUMBER`.
2. Create the webhook subscription (after deploy):
   `POST https://api.linqapp.com/api/partner/v3/webhook-subscriptions` with
   `target_url: "https://belle.help/eve/v1/linq?version=2026-02-03"` and
   `subscribed_events: ["message.received", "reaction.added", "reaction.removed"]`.
   Save the one-time `signing_secret` → `LINQ_WEBHOOK_SECRET`.

### 2. GitHub (Vercel Connect)
```bash
vercel connect create github --triggers      # provisions the managed GitHub App
vercel connect detach github/belle --yes
vercel connect attach github/belle --triggers --trigger-path /eve/v1/github --yes
```
During App registration subscribe to: `pull_request`, `pull_request_review`,
`pull_request_review_comment`, `issue_comment`, `check_suite`, `check_run`,
`workflow_run`, `status`, `installation`, `installation_repositories`.
Set `VERCEL_CONNECT_GITHUB_UID`, `GITHUB_BOT_NAME`, and the App's public
install URL → `NEXT_PUBLIC_GITHUB_APP_INSTALL_URL`.

### 3. Convex
`npx convex deploy` with a production deployment; set
`NEXT_PUBLIC_CONVEX_URL` + `CONVEX_DEPLOY_KEY` in Vercel.

### 4. AI
Production model calls route through Vercel AI Gateway using the deployment's
OIDC identity — no key needed. Locally set `AI_GATEWAY_API_KEY`. Users can
BYOK an OpenAI key in settings (encrypted, never redisplayed). ChatGPT/Codex
subscription execution is **not** offered — OpenAI does not support it for
third-party apps (see [ADR 003](docs/adr/003-openai-auth-and-inference.md)).

### 5. Admin + invite codes
Set `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD`, then seed the admin once:

```bash
npm run seed:admin
```

Or, on a serverless deploy, set `ADMIN_SEED_TOKEN` and call it once:

```bash
curl -X POST https://your-domain/api/admin/seed -H "x-seed-token: $ADMIN_SEED_TOKEN"
```

Sign in at `/admin`. The first sign-in forces a password change before anything
else is usable. From there you can approve/deny access requests (approving texts
the user automatically) and generate `BELLE-XXXX-XXXX` invite codes that
auto-approve on redemption.

### 6. Deploy
```bash
vercel deploy --prod        # deploys Next.js + Eve + cron schedules together
```
Attach the domain in the Vercel dashboard (or `vercel domains add <domain>`).
Verify schedules under Settings → Cron Jobs, sessions under Agent Runs.

CI runs typecheck + tests + build on every push (`.github/workflows/ci.yml`);
Vercel's Git integration deploys `main` automatically. Add a `CONVEX_DEPLOY_KEY`
repo secret (Convex dashboard → Settings → Deploy Keys → Production) to also
deploy Convex functions from CI — the step skips cleanly without it.

## Safety model (the short version)

- Phone identity is HMAC-hashed; onboarding links are signed, single-use,
  30-minute, bound to the originating conversation.
- Every tool derives the tenant from verified session auth — never from model
  input. Repos outside the user's configuration fail closed.
- Autonomy levels 0–4 per repository; high-consequence actions always require
  a fresh, action-specific approval bound to the exact head SHA; a changed
  head voids it. Vague praise and stale "yes"es are never approval.
- Repository content (code, PR text, comments, CI logs, scripts) is untrusted
  data; the prompt-injection eval is a deployment gate.
- The sandbox gets no production secrets; git auth is injected just-in-time
  and the network policy is allow-listed.
- Everything consequential lands in the Convex audit log (Agent Runs is a
  debugging surface, not the audit trail).

## Testing

```bash
npm run test        # unit: encryption, onboarding links, env, approval logic
npx eve eval        # agent evals; merge-safety / approval-safety /
                    # prompt-injection / cross-tenant are release gates
```

## Pausing and resuming Belle

Belle is currently **paused** (2026-08-04) so another agent can use the Linq
line. Nothing was deleted; the deployment and website stay up.

What pausing does — three independent locks, in order of bluntness:

1. **Linq webhook subscription deactivated** (`is_active: false`). Stops
   delivery at the source. Deactivated rather than deleted on purpose: Linq
   only returns a subscription's signing secret at creation, so deleting it
   would permanently destroy the secret in `LINQ_WEBHOOK_SECRET`.
2. **`BELLE_PAUSED=1`** short-circuits every schedule, both inbound channels,
   and the eve session routes (which back the dashboard chat — a live
   inference path no channel guard covers). This is the lock that stops
   inference: a cron fires whether or not credentials exist.
3. **`LINQ_API_KEY` removed** from Vercel. Recoverable from
   `~/.linq/config.json` or the Linq dashboard.

To resume:

```bash
vercel env rm BELLE_PAUSED production -y
# restore the Linq key (value from ~/.linq/config.json or the Linq dashboard)
vercel env add LINQ_API_KEY production
vercel deploy --prod
```

Then re-activate the webhook subscription (`is_active: true`) via the Linq API
— reusing the existing subscription keeps `LINQ_WEBHOOK_SECRET` valid. Creating
a new subscription instead mints a new secret, which must be written back to
Vercel or every inbound webhook will fail signature verification.

`tests/unit/paused.test.ts` asserts the pause has no gaps: every schedule
checks `isPaused`, no markdown schedules exist (task mode cannot be paused),
and both channels check. A pause with a gap reads as "off" while something
keeps spending.

## Troubleshooting

- **`NEXT_PUBLIC_CONVEX_URL is not set`** — run `npx convex dev` (writes
  `.env.local`).
- **Linq webhook 401/ignored** — check `LINQ_WEBHOOK_SECRET` matches the
  subscription's one-time secret; the adapter rejects >5-minute-old
  timestamps (replay protection).
- **GitHub tools throw "not configured for this user"** — the repo isn't in
  the tenant's Convex `repositories` table; finish onboarding / check the
  installation webhook arrived.
- **Sandbox checkout fails locally** — local backends fall back through
  Docker → microsandbox → just-bash; just-bash has no real git. Use Docker
  locally or test fixes against a deployment.
- **Schedules don't fire in dev** — by design; trigger once with
  `curl -X POST localhost:2000/eve/v1/dev/schedules/<id>`.

## Known limitations

See [docs/REPORT.md](docs/REPORT.md#known-limitations) for the full list.
Highlights: Chat SDK state uses the in-memory adapter (subscription/dedup
state is per-instance; Convex-side dedup covers correctness), sandbox git
auth uses just-in-time token URLs pending firewall credential brokering
wiring, and sign-in is phone-possession only (passkeys/magic links post-MVP).
