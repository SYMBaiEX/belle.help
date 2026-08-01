# Production Readiness Checklist

Work through top to bottom before pointing real users at Belle.

## Credentials & infrastructure
- [ ] `APP_ENCRYPTION_KEY` generated (`openssl rand -hex 32`) and set in Vercel (Production only, sensitive)
- [ ] Vercel project created; `vercel deploy --prod` green
- [ ] `belle.help` attached (apex + www), HTTPS verified
- [ ] Production Convex deployment; `NEXT_PUBLIC_CONVEX_URL` + `CONVEX_DEPLOY_KEY` set; schema pushed
- [ ] Vercel Connect GitHub connector created (`vercel connect create github --triggers`), trigger re-attached at `/eve/v1/github`, event subscriptions confirmed (PRs, reviews, comments, checks, workflow runs, status, installation events)
- [ ] `VERCEL_CONNECT_GITHUB_UID`, `GITHUB_BOT_NAME`, `NEXT_PUBLIC_GITHUB_APP_INSTALL_URL` set; `GITHUB_TOKEN` NOT set in production
- [ ] Linq API token created; phone number provisioned; `LINQ_API_KEY` + `NEXT_PUBLIC_BELLE_PHONE_NUMBER` set
- [ ] Linq webhook subscription created at `https://belle.help/eve/v1/linq?version=2026-02-03` with `message.received`, `reaction.added`, `reaction.removed`; one-time `signing_secret` stored as `LINQ_WEBHOOK_SECRET`
- [ ] AI Gateway reachable via OIDC in production (send one test turn); `OPENAI_API_KEY` set if managed fallback desired

## Verification gates
- [ ] `npm run typecheck`, `npm run test`, `npm run build` green in CI
- [ ] `npx eve eval` — **merge-safety, approval-safety, prompt-injection, cross-tenant must pass; failure blocks deploy**
- [ ] Vercel Cron Jobs show all 5 schedules; trigger reconcile once and inspect Agent Runs
- [ ] Real-device pass: text the number from an iPhone (iMessage) and an Android (RCS/SMS) — onboarding link arrives, opens, completes; confirmation text arrives
- [ ] GitHub App installed on a test repo; open a test PR; notification text arrives; "review it" produces a review; approval → sandbox fix → push → CI → SHA-bound merge approval → merge; dashboard audit trail shows every step
- [ ] Duplicate webhook replay (resend same delivery) produces no duplicate messages
- [ ] Stale approval: push a new commit after approving a merge → merge refuses
- [ ] Uninstall the GitHub App → installation marked revoked, watches disabled, tools fail closed
- [ ] Account deletion removes credentials/memories/prefs and invalidates the session

## Operations
- [ ] Error reporting destination decided (Sentry DSN or Vercel Observability alerts)
- [ ] Spending guards: per-user usage quotas verified writing `usageEvents`; alert on daily inference spend
- [ ] Linq chat-health gating spot-checked (STOP → no further sends; START clears)
- [ ] Runbook links: Agent Runs, Convex dashboard, Linq dashboard, Connect dashboard
- [ ] Threat-model top residuals accepted or mitigated (SIM swap step-up, sandbox credential brokering, dependency supply chain)
