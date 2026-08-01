# ADR 002: Linq Messaging Integration for Belle

- Status: Proposed
- Date: 2026-07-31
- Related: `docs/research/linq-api-notes.md` (exhaustive endpoint/payload reference this ADR
  is built on)

## Context

Belle is a textable AI GitHub agent — users interact with it over iMessage/RCS/SMS via the
Linq Partner API V3. We need to decide, feature by feature, whether Belle's messaging layer
sits on top of Vercel's Chat SDK via `@linqapp/chat-sdk-adapter`, or calls the Linq V3 REST
API directly, and how the two integrate (webhook ingress, signature verification, dedup,
identity mapping, protocol degradation, idempotency).

Linq unifies iMessage, RCS, and SMS/MMS behind one API (base URL
`https://api.linqapp.com/api/partner/v3`, bearer-token auth), and delivers all async state
(inbound messages, delivery/read receipts, reactions, typing, group/chat-health changes) as
signed webhooks with at-least-once delivery.

## Decision

### 1. Chat SDK adapter vs. direct API — feature split

Use `@linqapp/chat-sdk-adapter` (`npm install @linqapp/chat-sdk-adapter chat`) for the core
conversational loop, since it already maps Linq's webhook/REST model onto Chat SDK's
thread/message/reaction primitives and does its own HMAC verification internally:

**Via the Chat SDK adapter:**
- Inbound/outbound text in DMs and group chats (`chat.onDirectMessage`, `chat.onNewMessage`,
  `thread.post`).
- Inbound media (arrives as Chat SDK attachments) and outbound media (`attachments`/`files`
  sent as media parts).
- Reactions/tapbacks, both directions, via the adapter's built-in tapback ↔ emoji mapping
  (`like`↔`thumbs_up`, `dislike`↔`thumbs_down`, `love`↔`heart`, `laugh`↔`laugh`,
  `emphasize`↔`exclamation`, `question`↔`question`; unmapped custom emoji pass through raw).
- Typing indicators in 1:1 chats (`thread` typing helpers) — the adapter itself won't emit
  them in group chats because Linq rejects that server-side.
- Outbound text edits (bounded by Linq's underlying 5-edits/15-minutes rule).
- Webhook ingress and verification for the events the adapter understands
  (`message.received`, `reaction.added`, `reaction.removed`, plus whatever else it consumes —
  anything it doesn't handle is acked `200` and ignored).

**Requires direct Linq V3 API calls (no Chat SDK abstraction exists for these):**
- Message effects (`effect: { type, name }` — confetti, fireworks, slam, invisible ink, etc.)
  and text decorations (`text_decorations` — bold/shake/etc.) — iMessage-only, not part of the
  Chat SDK message model.
- Group chat management: `PUT /v3/chats/{chatId}` (display name/icon), participant
  add/remove, leave-chat.
- Contact card lifecycle (`POST/PATCH /v3/contact_card`) and
  `POST /v3/chats/{chatId}/share_contact_card` (iMessage Name & Photo Sharing prompt).
- Protocol pinning (`preferred_service`) and capability checks
  (`POST /v3/capability/check_imessage` / `check_rcs`) — Belle needs these to decide whether to
  degrade gracefully (see §5), which the generic adapter has no hook for.
- Location sharing, voice memos, rich link previews, message reply/thread targeting via
  `reply_to` + `part_index`.
- Chat health (`chat.health_status`) and phone-number reputation inspection — required for the
  opt-out/compliance gate (see §4); the adapter does not surface this.
- Stickers, message deletion — no iMessage equivalent, unsupported even by direct API in some
  cases (deletion removes Linq's record but does not unsend on-device).
- Idempotency-key control on individual sends where Belle needs guaranteed exactly-once
  semantics beyond whatever the adapter does internally (unverified whether the adapter passes
  through an `idempotency_key` option — treat as direct-API territory until confirmed).

Belle should instantiate a raw `@linqapp/sdk` client (`LinqAPIV3`) alongside the Chat SDK
adapter, sharing the same API key, for everything in the second list.

### 2. How webhooks reach Belle

- Single Linq webhook subscription (`POST /v3/webhook-subscriptions`) pointed at Belle's
  ingress route, with `?version=2026-02-03` pinned explicitly on the `target_url` (never rely
  on "latest at creation time" — payload shape changes are opt-in per subscription).
- Subscribed events, at minimum: `message.sent`, `message.received`, `message.delivered`,
  `message.read`, `message.failed`, `message.edited`, `reaction.added`, `reaction.removed`,
  `chat.created`, `chat.typing_indicator.started/stopped`, `participant.added/removed`,
  `phone_number.status_updated`.
- The Chat SDK adapter's route (`chat.webhooks.linq(request)`) is the single ingress endpoint;
  it must receive the **raw** request body (no body-parsing middleware ahead of it) so the
  HMAC check matches Linq's signed bytes exactly.
- Store the `signing_secret` returned once at subscription-creation time in Belle's secret
  store — it cannot be retrieved later; rotation means delete + recreate the subscription
  (which is a brief availability gap Belle must tolerate, e.g. by creating the new subscription
  before deleting the old one and running both briefly in parallel).

### 3. Signature verification

The adapter's `signingSecret` option does Standard Webhooks HMAC-SHA256 verification
internally (`{webhook-id}.{webhook-timestamp}.{rawBody}`, base64-decoded `whsec_` key, 5-minute
replay window, constant-time compare against `v1,<base64>` in `webhook-signature`) — Belle
does not need to reimplement this for adapter-routed events.

For any endpoint Belle stands up **outside** the adapter (e.g. a raw webhook receiver for
events the adapter doesn't consume, like `phone_number.status_updated` or
`chat.typing_indicator.*` if Belle needs those independent of the Chat SDK loop), use the
official `@linqapp/sdk` helper: `client.webhooks.unwrap(rawBody, { headers })`, which throws on
an invalid signature and returns a typed event — again fed the raw body, not parsed JSON.
Manual verification (only if neither helper applies) follows Standard Webhooks exactly as
documented in `linq-api-notes.md` §7: reject timestamps >5 min old, HMAC-SHA256 over
`id.timestamp.rawBody`, constant-time compare.

Belle must **not** trust the legacy `X-Webhook-*` headers as its primary path (Linq still
sends them for back-compat, but they use a different, deprecated hex-encoding scheme) — always
verify via `webhook-signature`/Standard Webhooks.

### 4. Duplicate prevention (webhook dedup + outbound idempotency)

- **Inbound dedup:** Linq delivery is at-least-once with retries up to 10 times over ~25
  minutes. Belle must key a dedup table (or use Convex/DB unique-constraint semantics) on the
  webhook envelope's `event_id` (identical to the `webhook-id` header). Process each `event_id`
  exactly once; on redelivery, look it up and return `200` immediately without reprocessing.
  Store the `event_id` durably before doing any side-effecting work (e.g. calling the LLM,
  writing to GitHub) so a crash mid-processing doesn't cause a duplicate action on retry.
- **Outbound idempotency:** every outbound send from Belle (via direct API or via the adapter,
  if it exposes the option) should set `message.idempotency_key` (max 255 chars, e.g. a UUID
  derived from Belle's own internal job/request id) so that Belle's own retry logic — network
  timeouts, webhook-triggered re-processing, at-least-once queue semantics on Belle's side —
  never double-sends a reply. This is a separate concern from inbound dedup: `event_id` dedups
  what Belle *receives*, `idempotency_key` dedups what Belle *sends*.
- **Trace correlation:** persist the `trace_id` returned on every outbound send (response body
  / `X-Trace-ID` header) alongside Belle's internal message record. The same `trace_id`
  reappears on the resulting `message.sent` → `message.delivered`/`message.read` (or
  `message.failed`) webhooks, giving Belle a join key independent of `event_id` for
  reconstructing full send lifecycles in logs/support tooling.

### 5. Phone-identity → user mapping

Linq handles are E.164 phone numbers or emails, each carrying `service`
(`iMessage`/`RCS`/`SMS`) and `is_me`. Belle's user-identity layer should key primarily on the
**handle string** (E.164-normalized phone or lowercase email) rather than any Linq-internal
`id` (handle UUIDs are scoped per-chat-participant, not globally stable identity for a person
across chats — confirm this against the SDK before relying on it, but treat handle string as
the safe canonical key in the meantime). A GitHub identity (OAuth-linked account) should be
linked to a Belle user record keyed by verified handle; first-contact flow should record
`chat_id` (thread id, or `linq:{chatId}` if going through the adapter) ↔ Belle user ↔ linked
GitHub account as a durable mapping, since Linq's own `chat_id` is stable for the lifetime of a
DM (group chats get a *new* `chat_id` if the participant set changes, per Linq's chat-matching
rules — Belle must not assume a group's `chat_id` is permanent across membership changes).

### 6. iMessage / RCS / SMS behavioral differences and graceful degradation

Per the capability matrix (full detail in `linq-api-notes.md` §6), Belle's behavior must adapt
per delivery protocol:

| Capability | iMessage | RCS | SMS |
|---|---|---|---|
| Delivery/read receipts | yes | yes | no |
| Reactions | yes | yes | no |
| Typing indicators | yes | no | no |
| Message effects / decorations | yes | no | no |
| Threading (`reply_to`) | yes | no | no |
| Rich link previews | yes | yes | no |

Design implications:
- Belle should **omit `preferred_service`** on normal sends (let Linq's automatic
  iMessage→RCS→SMS fallback pick the richest available channel), and only pin
  `preferred_service: "iMessage"` when a message genuinely depends on an iMessage-only feature
  (effect, decoration, threading) — with the understanding that pinning `iMessage` means the
  send **hard-fails** (no fallback) if the recipient isn't reachable there.
  Use the capability-check endpoints sparingly (rate-limited to 1 call/10s, cache results for
  minutes) before committing to an iMessage-only UX for a new recipient, rather than
  discovering the failure at send time.
  Note that `preferred_service: "RCS"` and `preferred_service: "SMS"` are functionally
  identical (both mean "RCS if available, else SMS, never iMessage") — Belle should treat them
  as one value internally (e.g. always emit `"RCS"`) rather than exposing a false choice.
- Belle must not treat "no `message.delivered`/`message.read` webhook" as an error condition
  when the send used SMS/MMS — those protocols have no receipt mechanism at all. Belle's
  delivery-tracking state machine needs an explicit "SMS fallback, no further receipts
  expected" terminal state distinct from "waiting for delivery confirmation."
  the underlying `service` field on the send response (vs. the requested `preferred_service`)
  tells Belle which protocol was actually used, so this can be decided per-message rather than
  per-recipient.
- Typing indicators and message effects/decorations/threading should be treated as
  best-effort UX enhancements Belle applies opportunistically on iMessage 1:1 chats and
  silently skips (not error) everywhere else — Linq already silently ignores these on
  unsupported protocols, so Belle's code should mirror that "degrade, don't fail" posture
  rather than branching on protocol before every send.
- Reactions: since RCS also supports reactions, Belle can rely on the adapter's tapback mapping
  for both iMessage and RCS recipients; it should not assume reactions are iMessage-exclusive
  when deciding whether to use them as a lightweight ack UX.

### 7. Trace ID storage

Every outbound Linq API call and every inbound webhook carries a 32-hex W3C `trace_id`
(response header `X-Trace-ID` on API calls; `trace_id` field on webhook envelopes and error
bodies). Belle should:
- Persist `trace_id` on Belle's own outbound-message and inbound-event records (a plain indexed
  column, not the primary key — `event_id`/internal message id remain primary keys).
- Log `trace_id` alongside every Linq API call and webhook receipt so support escalations to
  Linq can reference it directly (`trace_id` is what Linq support asks for).
- Not attempt to set or forward a client-supplied `traceparent`/`tracestate` header to Linq —
  Linq always discards and regenerates trace context server-side per request (security
  measure against forged/cross-tenant trace IDs), so there's no cross-system trace federation
  to wire up beyond storing the ID Linq hands back.

### 8. Outbound idempotency (send-path summary)

Every Belle-initiated send (chat creation and follow-up messages, via direct API or, if
supported, through the adapter) sets `message.idempotency_key`. Recommended key derivation:
a UUID deterministically derived from Belle's own internal job/queue message id (not a fresh
random UUID per attempt), so that if Belle's own job runner retries a failed webhook-triggered
send, the retry reuses the same key and Linq returns the original response instead of sending
twice. This is layered defense alongside Belle's own at-most-once send-orchestration logic —
Linq's idempotency is the safety net for network-level retries, not a substitute for correct
internal state tracking.

### 9. Compliance gate (opt-out) — cross-cutting, blocks all of the above

Regardless of adapter vs. direct-API, **every outbound send path in Belle must check
`chat.health_status.status` before sending** and refuse to send if it is `OPTED_OUT`. Linq does
not suppress sends on Belle's behalf. Belle should also independently scan inbound message text
for the exact opt-out keywords (`STOP`, `UNSUBSCRIBE`, `OPTOUT`, `CANCEL`, `END`, `QUIT`, case-
sensitive exact match) on every `message.received` webhook as a belt-and-suspenders check, but
should treat Linq's own `health_status` as authoritative for the actual send-gate (since Linq's
opt-out clearing logic — via opt-in keywords or sustained two-way conversation — is more
nuanced than a keyword scan Belle would reimplement).

## Consequences

- Belle carries two Linq clients side by side: the Chat SDK adapter (`@linqapp/chat-sdk-adapter`
  + `chat`) for the conversational core, and a raw `@linqapp/sdk` (`LinqAPIV3`) client for
  effects/decorations, group management, contact cards, capability checks, and chat-health
  gating. Both share the same `LINQ_API_KEY` / webhook signing secret.
- A single webhook subscription, pinned to `?version=2026-02-03`, feeds the adapter's ingress
  route; any event types the adapter doesn't consume are either acked-and-ignored by the
  adapter or (if Belle needs them, e.g. `phone_number.status_updated` for line-health
  monitoring) handled by a second lightweight handler using `client.webhooks.unwrap`.
- Belle needs a durable `event_id` dedup store and an `idempotency_key`-bearing send path from
  day one — these are not optional hardening, they're required given Linq's at-least-once
  webhook delivery and Belle's own likely-async job processing.
- Protocol degradation (iMessage/RCS/SMS) is handled by *not* pinning `preferred_service` on
  default sends and treating richer features (effects, typing, threading, decorations) as
  best-effort additions gated on the actual `service` used, not assumed in advance.
- Open item carried into implementation: confirm (against `@linqapp/sdk` TypeScript types or
  the OpenAPI spec) the exact body shape for `POST /v3/chats/{chatId}/messages` (flat vs.
  `message`-wrapped) and whether the Chat SDK adapter exposes an idempotency-key passthrough,
  before finalizing Belle's send-path code — see `linq-api-notes.md` §12 for the full list of
  documentation gaps to verify.

## Alternatives considered

- **Direct API only, no Chat SDK adapter.** Rejected as the primary approach because the
  adapter already solves webhook verification, thread/message/reaction modeling, and dedup
  wiring for the majority of Belle's conversational surface — reimplementing that by hand
  would duplicate well-tested plumbing for no benefit, given Belle still needs direct-API calls
  for the effects/compliance/group-management surface regardless.
- **Chat SDK adapter only, no direct API client.** Rejected — the adapter explicitly does not
  support message effects, text decorations, group management, contact cards, capability
  checks, or chat-health inspection, all of which Belle needs (chat-health/opt-out gating in
  particular is a hard compliance requirement, not optional polish).


## Addendum (2026-08-01): verified signature scheme in production

Implementation note discovered while wiring the live deployment. Linq emits both
the Standard-Webhooks headers (`webhook-id` / `webhook-timestamp` /
`webhook-signature`) and the legacy headers (`x-webhook-timestamp` /
`x-webhook-signature`). The `@linqapp/chat-sdk-adapter` we depend on verifies the
**legacy** pair: hex HMAC-SHA256 over `` `${timestamp}.${rawBody}` ``, keyed by the
raw `whsec_…` secret string (not base64-decoded, prefix retained), with a
300-second freshness window.

Belle therefore does not implement its own verification — the adapter owns it, and
`LINQ_WEBHOOK_SECRET` must be the full `whsec_…` value exactly as returned once at
subscription-creation time. Verified against production `belle.help/eve/v1/linq`:
valid signature → 200, forged signature → 401, one-hour-old timestamp → 401.
