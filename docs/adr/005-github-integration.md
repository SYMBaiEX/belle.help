# ADR 005: GitHub Integration

- Status: Accepted
- Date: 2026-07-31

## Decision

Use the **Vercel Connect managed GitHub connector** as Belle's only GitHub
integration, with `eve/channels/github` + `connectGitHubCredentials` for webhook
ingestion and token minting, and **`@github-tools/sdk`** (v1.8.x, vercel-labs)
for typed GitHub tools composed under Belle's own approval policy.

No personal access tokens. No first-party GitHub App private key.

## Multi-tenant verdict

Connect is sufficient. Verified against `@vercel/connect@0.4.3` sources and the
installed Eve GitHub channel docs:

- The Eve docs state "token rotation, refresh, and **multi-installation
  tenancy** stay inside Connect."
- `ConnectTokenParams` accepts `installationId`; `getToken` /
  `connectGitHubCredentials(connector, params)` mint a short-lived token scoped
  to that installation. Belle stores each user's `installationId` in Convex
  (`githubInstallations`) and passes it when acting for that tenant.
- Installation lifecycle events (`installation`, `installation_repositories`)
  arrive through the Connect trigger and keep Convex in sync (repo selection,
  revocation).

**GitHub App fallback (not needed today):** if Connect ever fails to expose a
required capability (e.g. enumerating installations Belle has never seen an
event for), the fallback is a first-party GitHub App with the same channel
config (`credentials: { appId, privateKey, webhookSecret }` — natively supported
by `eve/channels/github`). The Convex data model is installation-keyed either
way, so migration is a credentials swap, not a schema change.

## Connect configuration

```bash
vercel connect create github --triggers          # provision managed App + trigger
vercel connect detach github/belle --yes
vercel connect attach github/belle --triggers --trigger-path /eve/v1/github --yes
```

Event subscriptions (set during App registration):
`pull_request`, `pull_request_review`, `pull_request_review_comment`,
`issue_comment`, `check_suite`, `check_run`, `workflow_run`, `status`,
`installation`, `installation_repositories`.

## Permissions (least privilege)

| Permission | Level | Why |
|---|---|---|
| Contents | Read & write | Read code for review; push approved fix commits |
| Pull requests | Read & write | Reviews, comments, merges |
| Checks | Read | CI investigation |
| Actions | Read | Workflow-run logs |
| Commit statuses | Read | Merge readiness |
| Metadata | Read | Mandatory |
| Members | None | Not needed |
| Administration | None | Belle never changes repo settings |

## Tool inventory and approval policy

Tools come from `@github-tools/sdk` (42 typed tools, octokit-based, AI SDK
v7-compatible, with an `eve` subpath) composed per subagent — never the full
`maintainer` preset. Belle's approval matrix:

**Read (no approval):**
`getPullRequest`, `listPullRequestFiles`, `getPullRequestDiff`, `listChecks`,
`getWorkflowRun` / logs, `getFileContents`, `searchCode`, `listComments`,
`listReviews`, branch protection / mergeability reads.

**Moderate (configured permission or approval — Convex policy decides):**
`addPullRequestComment`, `createPullRequestReview`, `addLabels`,
`requestReviewers`, `rerunWorkflowRun`.

**High consequence (`always()`-style approval + Convex approval record bound to
user + repo + PR + head SHA + expiry; both must agree):**
`createOrUpdateFile` (push path), `createPullRequest`, `mergePullRequest`,
`closePullRequest`, `triggerWorkflow`.

The SDK's own `requireApproval` defaults gate all write tools; Belle layers its
Convex-backed policy (`decideTenantApproval` pattern from Eve's multi-tenant
approvals doc) on top: policy checks tenant pinning → repository autonomy level
→ per-action grants → head-SHA binding, then returns `"user-approval"`,
`approved`, or `denied`.

Commits created through the API are signed by GitHub's web-flow key, so
Belle's pushes pass signed-commit branch protection.

## Token lifetime and revocation

- Installation tokens are short-lived (~1 h GitHub standard); Connect handles
  refresh and caching. Tools request a token per call path via
  `connectGitHubCredentials(..., { installationId })`.
- Sandbox never receives the token: git egress is authenticated by the Vercel
  Sandbox firewall credential broker (ADR 004).
- Revocation: user uninstalls the App (webhook marks Convex installation
  `revoked`, all repo watch rules disabled, sessions told on next turn) or
  Belle calls `revokeToken`. Dashboard "Disconnect GitHub" does both.

## Multi-tenant isolation

- Every tool `execute` derives `tenantId` from `ctx.session.auth.current`
  (never from model input), loads that user's installation from Convex, and
  refuses repos not present in the tenant's `repositories` table.
- Approval policies re-check ownership (`repositoryFullName` ∈ tenant repos)
  before returning anything but `denied`.
- Cross-tenant eval (`evals/cross-tenant.eval.ts`) is a deployment gate.

## Key GitHub API behaviors accounted for

- `mergeable`/`mergeable_state` are computed lazily — poll after PR mutation.
- Merge method must be allowed by repo settings; verify before offering.
- Reviews: `COMMENT` / `REQUEST_CHANGES` / `APPROVE` are distinct events with
  distinct approval policies (section 21 of the product spec).
- Draft PRs cannot merge; `ready_for_review` transitions re-trigger watch rules.
- Head SHA changes invalidate Belle approvals (enforced in Convex + tool code).
