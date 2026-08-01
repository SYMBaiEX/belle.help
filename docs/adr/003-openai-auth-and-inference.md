# ADR 003: OpenAI / ChatGPT / Codex Authentication for Belle's Multi-Tenant Inference

- Status: Accepted
- Date: 2026-07-31
- Context: Belle is a multi-tenant SaaS textable AI GitHub agent. This ADR
  decides how Belle authenticates to OpenAI for inference on behalf of many
  independent customer tenants, and documents what is (and is not) officially
  supported by OpenAI for third-party integrators, as of July 2026.

All claims below are sourced from primary OpenAI documentation, fetched
directly on 2026-07-31 (Markdown mirrors via the documented `.md` suffix
convention, e.g. `https://learn.chatgpt.com/docs/auth.md`). Every non-obvious
claim has an inline citation. Where documentation is silent or ambiguous,
this is stated explicitly rather than inferred.

## Summary verdict

| # | Question | Verdict |
|---|----------|---------|
| 1 | Can Belle bill inference to a customer's ChatGPT subscription? | **No.** No documented third-party OAuth flow exists that lets an external SaaS obtain a user's ChatGPT session/credit and call inference with it from Belle's own infrastructure. |
| 2 | Can Belle use a "customer-authorized Codex environment"? | **Not as a backend inference primitive.** Codex's "Sign in with ChatGPT" and Codex access tokens are documented only for OpenAI's own first-party surfaces (Codex CLI, IDE extension, ChatGPT desktop app, Codex cloud) run *by the end user*, not for embedding inside a third party's multi-tenant SaaS runtime. |
| 3 | Does ChatGPT auth provide transferable model credits? | **No.** Credits/quota are scoped to the individual ChatGPT account/workspace and consumed only through OpenAI's own Codex/ChatGPT clients; nothing in the docs describes exporting or delegating that quota to a third-party service. |
| 4 | Would each user need an isolated Codex runtime? | **Yes, if this path were attempted at all** — Codex's design (per-machine `~/.codex/auth.json` or OS keyring, per-user OAuth session, per-user sandbox/approval policy) assumes one human operator per runtime instance. There is no documented multi-tenant "Codex server" mode. |
| 5 | Commercial/technical viability of Option A (customer-authorized Codex) for Belle | **Not viable today.** No supported API surface for a third party to drive Codex-with-ChatGPT-auth headlessly per-tenant at scale. |
| 6 | Security risks if attempted anyway | Storing/relaying another user's `auth.json`/ChatGPT OAuth tokens inside Belle's servers would concentrate long-lived, refreshable, account-linked credentials outside OpenAI's own client boundary — a class of risk OpenAI's own docs treat as sensitive ("treat `~/.codex/auth.json` like a password"). |
| 7 | Required fallback | BYO OpenAI API key (Option B) and/or Belle-managed inference via a gateway (Option C). |

---

## 1. Does third-party "Sign in with ChatGPT" exist for external apps?

OpenAI documents exactly one "Sign in with ChatGPT" flow, and it is scoped to
**OpenAI's own Codex products** — the Codex CLI, the ChatGPT desktop app, the
IDE extension, and Codex cloud — not to arbitrary third-party applications:

> "Codex supports two ways to sign in when using OpenAI models: Sign in with
> ChatGPT for subscription access [or] Sign in with an API key for
> usage-based access. The ChatGPT desktop app, Codex CLI, and IDE extension
> support both sign-in methods for local work. Codex cloud requires signing
> in with ChatGPT."
> — https://learn.chatgpt.com/docs/auth

The mechanism is a local browser OAuth flow initiated by `codex login`, with
the resulting token cached locally:

> "Codex caches login details locally in a plaintext file at
> `~/.codex/auth.json` or in your OS-specific credential store... For sign in
> with ChatGPT sessions, Codex refreshes tokens automatically during use
> before they expire."
> — https://learn.chatgpt.com/docs/auth#login-caching

There is **no publicly documented OAuth client-registration process** (client
ID / redirect URI / scope list) that lets an unrelated third-party SaaS (like
Belle) register as an OAuth client of "Sign in with ChatGPT" and obtain a
token to call inference on the user's behalf from Belle's own servers. The
only OAuth flow OpenAI documents for third parties runs in the **opposite
direction**: ChatGPT/Codex acts as the OAuth *client* connecting outward to a
third party's MCP server (the third party is the resource server, and OpenAI
consumes the third party's data/tools — not the other way around):

> "Client: The OpenAI host, such as ChatGPT or Codex, acting on behalf of the
> user. Supported clients use Client ID Metadata Documents (CIMD), dynamic
> client registration (DCR), predefined OAuth clients, and PKCE."
> — https://developers.openai.com/apps-sdk/build/auth.md ("Authenticate your
> users" / "Custom auth with OAuth 2.1")

This confirms the "Apps SDK" / plugin / MCP-connector OAuth model lets a
third party (like Belle) accept ChatGPT as an inbound client to Belle's own
APIs — it is not a mechanism for Belle to *consume* the user's ChatGPT
identity/credits as an outbound inference credential. **Verdict: identity/
inference delegation from ChatGPT to a third-party backend is not officially
documented to exist for external apps.**

Separately, ChatGPT Enterprise admins can grant members permission to mint
non-interactive "Codex access tokens" for automation:

> "In ChatGPT Enterprise workspaces, admins can grant the access token
> permission so permitted members can create Codex access tokens for
> trusted, non-interactive Codex local workflows... Access tokens are
> intended for trusted scripts, schedulers, and private CI runners. For
> general OpenAI API calls, continue to use Platform API keys."
> — https://learn.chatgpt.com/docs/auth#ids=app,cli,ide (Codex access
> tokens for enterprise automation)

This is explicitly scoped to the *customer's own* CI/automation
infrastructure, not to a third-party multi-tenant SaaS platform, and the docs
themselves redirect general API use back to Platform API keys.

Device-code login also exists, but again only as an alternate way for a
human to authenticate the first-party Codex CLI on a headless machine, not a
generalized OAuth device-flow API for third parties:

> "Preferred: Device code authentication (beta) ... Run `codex login
> --device-auth`."
> — https://learn.chatgpt.com/docs/auth#login-on-headless-devices

## 2. Codex: device-code auth, App Server, and running inside third-party SaaS infrastructure

Codex documents a CLI, an IDE extension, a desktop app, and "Codex cloud"
(isolated per-task cloud sandboxes triggered from chatgpt.com, GitHub,
Linear, or Slack):

> "Run tasks in isolated cloud environments, work in parallel, and start
> work from the web, GitHub, Linear, or Slack."
> — https://developers.openai.com/codex/cloud.md

Configuration docs describe credential storage as either a local plaintext
file or the OS credential store, and explicitly warn against treating it
casually:

> "If you use file-based storage, treat `~/.codex/auth.json` like a
> password: it contains access tokens. Don't commit it, paste it into
> tickets, or share it in chat."
> — https://learn.chatgpt.com/docs/auth#credential-storage

Nothing in the fetched documentation describes a "Codex App Server" product
or API designed for a third party to host per-customer Codex sessions inside
its own multi-tenant backend, nor a supported way to accept many different
end users' ChatGPT OAuth grants and fan them out to isolated Codex runtimes
under Belle's control. The closest analog — Codex cloud — is itself a
first-party OpenAI-hosted product that customers reach directly via
chatgpt.com/codex or OpenAI-built integrations (GitHub/Linear/Slack), not an
API Belle can call to spin up a tenant-scoped Codex runtime on its own
infrastructure.

Where documentation is silent: OpenAI does not state anywhere in the fetched
pages that running a customer-authorized Codex session inside a third
party's servers is *prohibited*, but it also never documents it as
*supported*. Absence of an documented API/SDK for this pattern, combined
with Codex's local single-operator credential model
(`~/.codex/auth.json` per machine, browser-based OAuth, `forced_login_method`
/ `forced_chatgpt_workspace_id` enterprise controls scoped to one workspace),
means this is a first-party human-operator product, not a documented
multi-tenant backend primitive. **Verdict: technically and commercially not
viable as Belle's inference backend today.**

## 3. Transferable model credits?

The auth docs draw a direct line between sign-in method and billing model:

> "When you sign in with ChatGPT, Codex usage follows your ChatGPT workspace
> permissions, role-based access control (RBAC), and ChatGPT Enterprise
> retention and residency settings... When you sign in with an API key,
> Codex uses standard API pricing instead of included ChatGPT plan credits."
> — https://learn.chatgpt.com/docs/auth

This confirms ChatGPT-plan inference credits are consumed only through
OpenAI's own Codex/ChatGPT client surfaces tied to that individual account or
workspace. There is no documented mechanism to export, delegate, or
proxy that quota to a third-party server for use across many other tenants'
requests. **Verdict: not transferable.**

## 4. Would each user need an isolated Codex runtime?

If Belle were to attempt Option A despite the above, yes: Codex's documented
model is one authenticated operator per local credential/session
(`~/.codex/auth.json` or OS keyring on a single machine, refreshed in place),
with workspace-level enforcement flags such as `forced_chatgpt_workspace_id`
— https://learn.chatgpt.com/docs/auth#enforce-a-login-method-or-workspace —
and per-project sandbox/approval settings
— https://learn.chatgpt.com/docs/agent-approvals-security. Nothing in the
docs describes a supported way to multiplex many end users' distinct ChatGPT
identities through a single shared Codex process, so per-tenant isolation
(separate credential store, separate sandbox, separate approval policy) would
be a hard requirement, not an optimization — and there's still no documented
API to legitimately obtain that per-user credential from inside a SaaS
backend in the first place.

## 5. Commercial/technical viability of "customer-authorized Codex runtime" for multi-tenant SaaS

Not viable as designed. Codex's login, storage, refresh, and enterprise
policy model (`forced_login_method`, `forced_chatgpt_workspace_id`, MFA
requirements for Codex cloud — https://learn.chatgpt.com/docs/auth#secure-your-codex-cloud-account)
is built around one human signing into one local/cloud Codex session at a
time under their own OpenAI account, with browser-based OAuth or device-code
login performed interactively by that person. There is no documented
programmatic grant flow, service-account delegation, or "Codex as a hosted
API for a third party's other users" product. Building Belle's core
inference path on this would require reverse-engineering an undocumented
credential-relay pattern that OpenAI has not published, sanctioned, or
supported for third parties.

## 6. Security risks of attempting Option A anyway

- Belle would have to solicit, store, and refresh another party's
  `auth.json`-equivalent OAuth credentials — the same artifact OpenAI's own
  docs instruct users to "treat like a password" and never share
  (https://learn.chatgpt.com/docs/auth#credential-storage). Centralizing many
  users' such credentials in a multi-tenant SaaS backend is a high-value
  breach target with no documented revocation/scoping model designed for
  that use case.
- No documented per-request audience/scope binding exists for this token the
  way there is for MCP connector tokens (`resource`/`aud` claim enforcement,
  https://developers.openai.com/apps-sdk/build/auth.md), so Belle would have
  no OpenAI-sanctioned way to prove to OpenAI, or to the customer, that the
  token is being used only for that customer's own requests.
- It would bypass OpenAI's documented workspace controls (RBAC, retention,
  residency — https://learn.chatgpt.com/docs/auth) since those are designed
  to apply within OpenAI's own client surfaces, not a re-implemented one.
- It sits in a legally and contractually ambiguous zone since OpenAI has not
  published terms authorizing third-party services to run Codex sessions on
  users' behalf inside their own infrastructure; this ADR does not assert a
  specific ToS violation (that determination requires legal review of
  OpenAI's current usage policies, which were not part of this technical
  documentation review), but flags the absence of any explicit permission as
  a material risk.

## 7. Required fallback

Given verdicts 1-6, Belle **must not** depend on customer ChatGPT/Codex
sign-in as its inference path, and needs a documented, supported
authentication mechanism instead.

---

## Decision: Provider priority for Belle inference

### Option A — Customer-authorized Codex runtime: **Rejected (not officially supported)**

Per Sections 1-6 above, there is no documented API, SDK, or policy
supporting a third-party multi-tenant SaaS driving a customer's
ChatGPT-authenticated Codex session from Belle's own infrastructure. Belle
will not build on this path. If OpenAI later publishes a documented
delegated-auth / service-account product for this pattern, this ADR should
be revisited.

### Option B — Bring-your-own OpenAI API key (encrypted at rest, never redisplayed): **Primary supported path**

This is the officially documented, intended mechanism for third-party
applications to call OpenAI models on a customer's behalf and bill that
customer's own OpenAI account:

- Standard API-key authentication, billed at standard API rates to the
  key owner's Platform account:
  > "OpenAI bills API key usage through your OpenAI Platform account at
  > standard API rates. See the API pricing page."
  > — https://learn.chatgpt.com/docs/auth
- Core inference surface: the Responses API
  (`POST https://api.openai.com/v1/responses`), including background mode
  for long-running agent tasks with polling/streaming resume
  (`background: true`) — https://platform.openai.com/docs/guides/background.md
- Async completion notifications via OpenAI webhooks (Standard Webhooks
  spec, signature verification via `client.webhooks.unwrap`) —
  https://platform.openai.com/docs/guides/webhooks.md — which fits Belle's
  need to notify tenants over SMS/text when a long agent run finishes
  without holding an open connection per tenant.
- Org/project-level rate limits and spend controls apply per API key/
  project (see https://platform.openai.com/docs/guides/rate-limits.md),
  which Belle should surface to each tenant so they understand the quota
  their own key is subject to.

Belle implementation requirements:
- Store each tenant's API key encrypted at rest (e.g., envelope encryption /
  KMS-backed secret), scoped per tenant/project.
- Never redisplay the key in the UI after initial entry (show only a
  masked/last-4 identifier), consistent with how OpenAI's own dashboard
  treats API keys (`https://platform.openai.com/api-keys` issues a
  one-time-visible secret).
- Prefer OpenAI Projects (per-tenant project + key) where the customer's org
  supports it, so Belle can align with the customer's own rate limits,
  spend limits, and usage/billing visibility rather than a shared pool.

### Option C — Belle-managed inference via Vercel AI Gateway: **Fallback / no-BYOK default**

For tenants who have not supplied their own API key, Belle falls back to
inference billed to Belle's own account through Vercel AI Gateway (multi-
provider routing, includes OpenAI models), with Belle absorbing/metering
cost to the tenant via its own billing plan. This requires no OpenAI-specific
auth beyond Belle's own gateway credentials and does not depend on any
customer OpenAI or ChatGPT account.

### Resulting priority order for Belle

1. **Option B (BYOK)** if the tenant has supplied and validated an OpenAI
   API key — direct, officially documented, customer-billed.
2. **Option C (Belle-managed via AI Gateway)** as the default/fallback for
   tenants without a key, or if a BYOK key is invalid/rate-limited/revoked.
3. **Option A is not implemented.** No supported path exists as of this
   writing (2026-07-31); revisit only if OpenAI publishes an official
   delegated Codex/ChatGPT-auth product for third-party platforms.

## Sources consulted (fetched 2026-07-31)

- https://learn.chatgpt.com/docs/auth — Codex/ChatGPT authentication, sign-in
  methods, credential storage, device-code login, enterprise access tokens
- https://developers.openai.com/codex/cli.md — Codex CLI overview and sign-in
- https://developers.openai.com/codex/cloud.md — Codex cloud overview
- https://developers.openai.com/codex/local-config.md — Codex config
  precedence, feature flags
- https://developers.openai.com/codex/security.md — Codex Security product
  (separate from base auth)
- https://developers.openai.com/apps-sdk/build/auth.md — MCP/plugin OAuth
  2.1 model: ChatGPT/Codex as inbound OAuth *client* to third-party servers
- https://learn.chatgpt.com/docs/agent-approvals-security — Codex sandbox/
  approval model
- https://platform.openai.com/docs/guides/background.md — Responses API
  background mode
- https://platform.openai.com/docs/guides/webhooks.md — OpenAI webhooks
- https://platform.openai.com/docs/guides/rate-limits.md — Rate limits/spend
- https://platform.openai.com/api-keys — API key management (referenced by
  learn.chatgpt.com/docs/auth as the source of Platform API keys)
- https://openai.com/api/pricing/ — standard API pricing (referenced by
  learn.chatgpt.com/docs/auth)

Note on method: pages were retrieved via their documented Markdown mirrors
(`<page-url>.md`, per the notice present on every fetched page: "Markdown
versions of documentation pages are available by appending `.md` to the page
URL"). No content was fabricated or paraphrased from unstated assumptions;
direct quotes are used for load-bearing claims.
