# ADR 004: Vercel Platform Usage

- Status: Accepted
- Date: 2026-07-31

## Decision

Belle runs entirely on Vercel: one Next.js project wrapped with `withEve()`
(`eve/next`) hosts both the web app (marketing, onboarding, dashboard) and the
Eve agent as a single deployment. Convex hosts structured product data.

## Trust boundaries — these are NOT interchangeable

| System | What it authenticates | What it is NOT |
|---|---|---|
| **Vercel OIDC** | Belle's *workload* (the deployment itself) to Vercel platform services: AI Gateway, Sandbox, Connect | Not user authentication; not OpenAI user authorization |
| **Belle account auth** | The human user to Belle's web app and API | Not GitHub repo authorization |
| **Vercel Connect (GitHub connector)** | Belle's access to a specific end-user's GitHub installation, via short-lived installation tokens | Not user identity; not billing |
| **OpenAI authorization** | Inference billing to the user's own OpenAI API account (BYOK, ADR 003) | Not identity; not GitHub |
| **AI Gateway managed mode** | Inference billed to Belle's Vercel account | Not user authorization |

## How OIDC authenticates Belle's workload

On Vercel, the deployment receives an automatically issued and rotated OIDC
token. `@vercel/connect` and the AI Gateway accept it, so production needs **no**
`AI_GATEWAY_API_KEY` and no Connect API key. Locally, `vercel env pull` provides
a development OIDC token; `AI_GATEWAY_API_KEY` is a local-only fallback.

## How Connect issues GitHub credentials

- One managed GitHub connector (`vercel connect create github --triggers`),
  UID e.g. `github/belle`.
- End users install the managed GitHub App on their own account/org and select
  repositories (standard GitHub App install surface).
- `connectGitHubCredentials(connector, params)` (from `@vercel/connect/eve`)
  returns `{ installationToken, webhookVerifier }`. `ConnectTokenParams`
  accepts `installationId`, so Belle mints a distinct short-lived token per
  tenant installation. Subject type is `app` (installation-scoped).
- Webhooks: Connect receives the App's webhooks, verifies them, and forwards
  to `/eve/v1/github` (`vercel connect attach <uid> --triggers --trigger-path
  /eve/v1/github`). Verification of the forwarded trigger is by **Vercel OIDC
  signature**, not a GitHub webhook secret.
- Revocation: `revokeToken(connector, { subject, installationId })`; GitHub-side
  uninstalls arrive as `installation` events and mark the Convex installation
  `revoked`.

There is no `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_WEBHOOK_SECRET`
to hold. See ADR 005 for the multi-tenant analysis.

## Eve + Workflows

Eve's durable engine runs on the Vercel Workflow SDK automatically when
deployed on Vercel (`defineAgent` default world). Belle does not call Workflows
directly; parking, resumption, and step durability come through Eve.

## Eve + Sandbox

`defineSandbox({ backend: vercel() })` on the code-fixer subagent. Vercel
Sandbox provides ephemeral VMs, vCPU/memory limits, execution timeout,
domain-level network policy, and firewall credential brokering (the GitHub
installation token is injected on egress at the firewall and never enters the
sandbox filesystem or process env). Local dev falls back through
`defaultBackend()` (Docker → microsandbox → just-bash).

## Model calls through AI Gateway

`defineAgent({ model: "<provider>/<model>" })` routes through the Gateway with
OIDC workload auth. BYOK users (ADR 003) route through a dynamic model
selection (`defineDynamic`, `session.started` scope) that constructs a direct
provider `LanguageModel` with the tenant's decrypted key — the key is resolved
server-side from Convex and never appears in prompts, tool results, or client
code.

## Agent Runs

Every Eve session appears in Vercel Agent Runs for step-level inspection
(tool calls, model usage, timing). Used for debugging and support only —
Belle's permanent audit trail is the Convex `auditEvents` table because Agent
Runs retention is bounded.

## Environments

- Production: `belle.help` (apex + `www` redirect) attached to the Vercel
  project; production Convex deployment; production Linq webhook target.
- Preview: per-branch preview URLs; separate Convex dev deployment; Linq
  webhooks are NOT attached to previews (no accidental customer texting);
  simulation endpoints (clearly labeled) drive the message loop instead.

## Provider secrets that remain necessary

| Variable | Why it still exists |
|---|---|
| `LINQ_API_KEY`, `LINQ_WEBHOOK_SECRET` | Linq is not a Vercel-managed integration; direct Partner API V3 auth |
| `APP_ENCRYPTION_KEY` | Application-level AES-256-GCM for tenant credentials + HMAC phone hashing + onboarding link signing |
| `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT`, `CONVEX_DEPLOY_KEY` | Convex data plane |
| `OPENAI_API_KEY` (optional) | Belle-managed fallback / dev only |
| `AI_GATEWAY_API_KEY` (optional) | Local dev only; OIDC covers production |
| `NEXT_PUBLIC_BELLE_PHONE_NUMBER` | Display-only; the real number lives in Linq |
