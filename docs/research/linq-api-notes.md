# Linq Partner API V3 — Technical Reference for Belle

Source: `https://docs.linqapp.com/llms-full.txt` fetched 2026-07-31, saved locally at
`docs/research/linq-llms-full.txt` (54,983 lines / ~1.5 MB — the fetch succeeded, HTTP 200).
All facts below are quoted/paraphrased directly from that file (line numbers refer to that
local copy) plus the linked `docs.linqapp.com` guide pages it mirrors. Nothing here is
fabricated — where the docs didn't give an exact value, that's called out explicitly.

---

## 1. Base URL & Authentication

- **Base URL:** `https://api.linqapp.com/api/partner/v3`
- **Auth header:** `Authorization: Bearer <LINQ_API_KEY>` on every request (no other auth
  header). (llms-full.txt:245-284)
- Token also gated: which phone numbers you can send `from`, which chats/messages/attachments
  you can access, and your rate limits/daily quota.
- Get a token from the Linq dashboard: `dashboard.linqapp.com/api-tooling` → API → Overview →
  "Generate new token." (There is no OAuth/client-credentials flow documented — it's a static
  bearer token you generate and rotate manually.)
- `Content-Type: application/json` on all POST/PUT bodies.
- Official SDKs:
  - Node/TS: `npm install @linqapp/sdk` → `import LinqAPIV3 from '@linqapp/sdk'`, reads
    `LINQ_API_V3_API_KEY` (per line 282) or you pass `apiKey` explicitly. (Note: two different
    env var names appear in the docs — `LINQ_API_KEY` is used in most examples, but the
    "Quick example" block says the SDK "reads `LINQ_API_V3_API_KEY` by default." Verify against
    the actual SDK source before hard-coding an env var name; prefer passing `apiKey` explicitly
    to avoid ambiguity.)
  - Python: `pip install linq-python`, `from linq import LinqAPIV3`
  - Go: `go get -u github.com/linq-team/linq-go` (imported as `linqgo`)
  - CLI: `npm install -g @linqapp/cli@latest` then `linq login --token <token>`
  - Claude Code / Cursor plugin (`linq-team/linq-ai`) exposes `search_docs` and `execute` MCP
    tools — this is the `plugin:linq:linq` MCP server visible in this session's tool list.

### Auth error responses

| Status | Code | Meaning |
|---|---|---|
| 401 | 2004 | Missing or invalid bearer token |
| 403 | 2005 | Valid token, insufficient permissions |
| 403 | 2006 | Cannot send from that phone number (not assigned to account) |
| 429 | 1007 | Rate limit exceeded |

---

## 2. Error envelope (all endpoints)

```json
{
  "success": false,
  "error": {
    "status": 400,
    "code": 1001,
    "message": "Missing required field",
    "doc_url": "https://docs.linqapp.com/error/codes/1xxx/1001/"
  },
  "trace_id": "2eff5df5c6f688733c007523c4d61cd9"
}
```

- On `429`, `error.retry_after` (seconds) is also present, mirroring the `Retry-After` header.
- Error code ranges: `1xxx` client/request (no retry — fix request), `2xxx` resource (no retry
  — fix auth/reference), `3xxx` server (retry w/ backoff), `4xxx` delivery (sometimes retry),
  `5xxx` attachment/file (sometimes retry).
- Key codes: `1001` missing required field, `1002` phone not E.164, `1003` invalid JSON body,
  `1004` invalid message content, `1005` invalid parameter value, `1006` cannot update a DM chat
  (group-only op), `1007` rate limited, `1008` invalid iMessage app message (`app.name` required,
  `app.team_id` must be 10 uppercase alphanumeric chars); `2001` chat not found, `2002` message
  not found, `2010` webhook subscription not found, `2012` contact card not configured for `from`
  number; `4003` webhook delivery failed.

---

## 3. Key concepts / vocabulary

- **Handle** — E.164 phone (`+14155551234`) or email; carries `service` (`iMessage`/`RCS`/`SMS`),
  `is_me`, and for group participants `status` (`active`/`left`/`removed`).
- **Phone number ("line")** — your provisioned senders; `status` is `ACTIVE` or `FLAGGED`,
  surfaced via `phone_number.status_updated` webhook.
- **Chat** — container for a conversation. DM = 1 recipient in `to`. Group = 2+ recipients, max
  **31** handles in `to`, requires iMessage or RCS (MMS group also supported but carrier-limited
  to ~10-20 participants).
- **Message** — belongs to a chat, `parts[]` array: `text` (≤10,000 chars), `media`
  (url or `attachment_id`), `link` (≤2,048 chars URL, must be sole part).
- **Attachment** — pre-uploaded file (≤100MB), referenced by `attachment_id`, never expires
  (persistent tier) or auto-purges after 1 day (ephemeral tier, opt-in).
- **Trace ID** — 32-hex W3C `trace-id`, in `X-Trace-ID` response header and `trace_id` field of
  every webhook envelope / error body. Client-supplied `traceparent`/`tracestate` are always
  discarded server-side (Linq generates a fresh one per request — no forgeable trace IDs).
- **Idempotency key** — `idempotency_key` field *inside* the `message` object (not an HTTP
  header), max 255 chars. Same key on retry ⇒ Linq returns the original response instead of
  re-sending.
- **Rate limits** — 7,000 combined inbound+outbound msgs/day/line (soft, recommended, no hard
  cap except sandbox); 30 msgs/60s per unique sender-recipient pair (hard, HTTP 429); sandbox
  accounts capped at 100 msgs/day (resets midnight UTC); capability-check endpoints limited to
  1 call per 10 seconds per number.

---

## 4. Chats

### Create a chat (and send first message) — `POST /v3/chats`

```bash
curl -X POST https://api.linqapp.com/api/partner/v3/chats \
  -H "Authorization: Bearer $LINQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+12223334444",
    "to": ["+15556667777"],
    "message": {
      "parts": [{ "type": "text", "value": "Hello from Linq!" }]
    }
  }'
```

Response:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "is_group": false,
  "last_message": {
    "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "parts": [{ "type": "text", "value": "Hello from Linq!" }],
    "sent_at": "2026-02-05T19:52:17.219Z",
    "service": "iMessage"
  }
}
```

Constraints:
- `from` must be a phone number assigned to your account.
- `to` is an array — 1 recipient = DM, 2+ = group (max 31; SMS/MMS fallback further limited by
  carriers to ~10-20).
- **First outbound message must not contain links** — `link` parts or text containing URLs are
  rejected on `POST /v3/chats` (HTTP-level validation). Send plain text first, then follow up
  with a link part once you have the chat ID.
- Group-chat matching: chats are keyed on `from` + the *exact* set of `to` handles. Re-posting
  the same `from`/`to` set returns the **existing** chat (idempotent-by-participant-set) unless:
  the existing chat has a `display_name` set, the participant set changed, or your line left the
  group — in which case you get a new chat.
- 409 "Chat still creating" can happen on duplicate concurrent creates — retry or use
  `idempotency_key`.

### Send follow-up message — `POST /v3/chats/{chatId}/messages`

```bash
curl -X POST https://api.linqapp.com/api/partner/v3/chats/{chat_id}/messages \
  -H "Authorization: Bearer $LINQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "parts": [{ "type": "text", "value": "Following up!" }] }'
```
Note: two different body shapes appear across the docs for this endpoint — the Quickstart shows
a top-level `{ "parts": [...] }` body, while Sending Messages / message-effects / reply examples
wrap it as `{ "message": { "parts": [...], ... } }`. **Trust the nested `message: {...}` shape**
(used consistently for `effect`, `reply_to`, `preferred_service`, `idempotency_key` — these are
documented as living "inside `message`"), and treat the flat quickstart example as a possible
simplification/typo in the docs. Verify against the OpenAPI/SDK types before shipping.

- `GET /v3/chats` — list chats, filter by `from`/`to`, cursor pagination (`cursor`,
  default page size 20, max 100, response includes `next_cursor`).
- `GET /v3/chats/{chatId}` — retrieve one chat (participants, protocol, `health_status`, etc).
- `POST /v3/chats/{chatId}/mark_as_read` (implied by "Mark a chat as read" — exact path not
  spelled out in prose, only referenced via API reference link; no-op on group chats).
- `PUT /v3/chats/{chatId}` — update group `display_name` / `group_chat_icon` (group-only;
  returns error 1006 on DMs).
- `POST /v3/chats/{chatId}/location/request`, `GET /v3/chats/{chatId}/location` — location
  sharing (1:1 iMessage only; returns 409 on group/SMS/RCS).
- `POST /v3/chats/{chatId}/share_contact_card` — iMessage Name & Photo Sharing prompt (needs an
  active contact card + at least one prior outbound message in the chat; call once/day).
- `POST /v3/chats/{chatId}/typing` (start) / `DELETE /v3/chats/{chatId}/typing` (stop).
- Group participant management: add/remove participant endpoints (exact paths given only via
  API-reference links: `chats/subresources/participants/methods/add|remove`), `leave_chat`.
  Groups must stay ≥3 members. iMessage groups only.

### Message parts

```json
{ "type": "text", "value": "Hello!" }
{ "type": "media", "url": "https://example.com/photo.jpg" }
{ "type": "media", "attachment_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
{ "type": "link", "value": "https://linqapp.com" }
```
Limits: ≤100 parts/message, ≤40 public-URL media parts/message (pre-uploaded attachments
exempt), text ≤10,000 chars, link URL ≤2,048 chars, link must be sole part, consecutive text
parts not allowed (interleave media or send separately). MIME type is inferred server-side.

### Text decorations (iMessage-only)

```json
{
  "type": "text", "value": "Hello world",
  "text_decorations": [
    { "range": [0, 5], "style": "bold" },
    { "range": [6, 11], "animation": "shake" }
  ]
}
```
`range` = `[start, end)` UTF-16 code units. Styles: `bold`, `italic`, `strikethrough`,
`underline`. Animations: `big`, `small`, `shake`, `nod`, `explode`, `ripple`, `bloom`, `jitter`.
Style ranges may overlap each other; animation ranges must not overlap anything. Ignored
(silently) on RCS/SMS.

### Reply / threading

```json
{
  "message": {
    "parts": [{ "type": "text", "value": "Great point!" }],
    "reply_to": { "message_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8", "part_index": 0 }
  }
}
```
`part_index` optional (defaults to whole message). iMessage-only feature (threading not
supported on RCS/SMS per capability matrix). Walk a thread via
`GET /v3/messages/{messageId}/thread` (exact path only given via reference link
"List Messages Thread"; query params `cursor`, `limit` (max 100), `order` (`asc` default/`desc`).

### Message effects (iMessage-only, one per message)

```json
"effect": { "type": "screen", "name": "confetti" }
```
Screen names: `confetti`, `fireworks`, `lasers`, `sparkles`, `celebration`, `hearts`, `love`,
`balloons`, `happy_birthday`, `echo`, `spotlight`.
Bubble names: `slam`, `loud`, `gentle`, `invisible`.
Silently ignored on RCS/SMS.

### Idempotency

```json
{
  "from": "+12223334444",
  "to": ["+15556667777"],
  "message": {
    "parts": [{ "type": "text", "value": "Hello" }],
    "idempotency_key": "unique-request-id-123"
  }
}
```
Works identically on `POST /v3/chats` and `POST /v3/chats/{chatId}/messages`. Key lives inside
`message`, not a header, max 255 chars.

### Editing / deleting messages

- Edit: `PATCH`/`PUT` (exact verb only given via reference link "Edit Message API reference" —
  `messages/methods/update`). Pass `part_index` (0-based) + new `text`. **Text parts only,
  iMessage only**, max **5 edits within 15 minutes** of original send. Confirmed via
  `message.edited` webhook (only delivered on `2026-02-03` webhook version).
- Delete: `DELETE /v3/messages/{messageId}` (path only via reference link). Removes from Linq's
  records but does **not unsend** — recipient still sees it on-device.

### Reactions (tapbacks) — `POST /v3/messages/{messageId}/reactions`

```bash
curl -X POST https://api.linqapp.com/api/partner/v3/messages/{messageId}/reactions \
  -H "Authorization: Bearer $LINQ_API_KEY" -H "Content-Type: application/json" \
  -d '{ "operation": "add", "type": "love" }'
```
Built-in tapback types: `love`, `like`, `dislike`, `laugh`, `emphasize`, `question`. Custom
Unicode emoji reactions and sticker attachments also supported (`reaction_type: "custom"` +
`custom_emoji`, or `reaction_type: "sticker"` + `sticker` object). `operation: "remove"` to
un-react. Target a specific part with `part_index`. iMessage feature (RCS also supports
reactions per the capability matrix; SMS does not). Fires `reaction.added` / `reaction.removed`
webhooks.

### Typing indicators — iMessage, 1:1 chats only

- Start: `POST /v3/chats/{chatId}/typing`
- Stop: `DELETE /v3/chats/{chatId}/typing`
- A single start shows the indicator ~85-90s then auto-clears; refresh every 60s to keep it
  visible continuously. Sending a message always clears it. **Not supported in group chats** —
  requests on RCS/SMS/group chats are still accepted (204) but no indicator is actually
  delivered. Reliable delivery requires having sent a message in that chat within roughly the
  last 5 minutes.
- Inbound: `chat.typing_indicator.started` / `chat.typing_indicator.stopped` webhooks.

### Voice memos

`POST /v3/chats/{chatId}/voicememo` — sends an inline-playback iMessage/RCS voice-memo bubble
(distinct from an audio file sent as a plain media part, which renders as a downloadable
attachment instead). Confirmed via standard `message.sent`/`message.delivered`/`message.failed`
webhooks.

---

## 5. Attachments — `POST /v3/attachments`, `GET/DELETE /v3/attachments/{attachmentId}`

- **Inline via URL** (≤10MB): put a public HTTPS URL directly in a media part's `url` field —
  Linq downloads and processes it on every send, no pre-upload needed.
- **Pre-upload** (required >10MB, up to 100MB, and recommended for reuse/latency):
  1. `POST /v3/attachments` with file metadata → returns presigned `upload_url` (valid 15 min)
     + permanent `attachment_id`.
  2. `PUT` raw bytes to `upload_url` with the returned `required_headers` (no JSON/multipart).
  3. Reference `attachment_id` in a media part — no expiration, ownership-scoped to your
     partner account (cross-partner references return `404`, existence not disclosed).
- Supported types: Images JPEG/PNG/GIF/HEIC/HEIF/TIFF/BMP; Video MP4/MOV/M4V; Audio
  M4A/AAC/MP3/WAV/AIFF/CAF/AMR; Documents PDF/TXT/RTF/CSV/Office/ZIP; Contact/Calendar VCF/ICS.
- CDN domain to allowlist: `cdn.linqapp.com` (both `url` on media/voice-memo parts and
  `download_url` on attachment objects).
- Persistent tier (default): retained until you `DELETE`. Ephemeral tier (opt-in via Linq
  support, partner-wide or per-line): short-TTL presigned URLs, **hard 24h backstop** even
  without explicit delete, applies to both inbound and outbound attachments in scope.
- `DELETE /v3/attachments/{attachmentId}` → `204` on success; irreversible; message parts that
  referenced it remain with the reference stripped, old webhook URLs 404 going forward.
- TLS 1.2+ in transit, AES-256 at rest.

---

## 6. Protocol selection (iMessage / RCS / SMS)

`message.preferred_service`: `iMessage` | `RCS` | `SMS`. Omit for automatic fallback chain
**iMessage → RCS → SMS**.

| Value | Behavior |
|---|---|
| `iMessage` | iMessage only, no fallback — send **fails** if recipient isn't reachable on iMessage |
| `RCS` | RCS if supported, else SMS. Never iMessage. |
| `SMS` | RCS if supported, else SMS. Never iMessage (same as `RCS` value — SMS is not a "force plain SMS" override). |

Response `service` field = what was actually used (vs. `preferred_service` = what was requested).

### Protocol capability matrix (llms-full.txt:4121-4141)

| Feature | iMessage | RCS | SMS |
|---|---|---|---|
| Text | Yes | Yes | Yes |
| Images/video | Yes | Yes | MMS |
| Read receipts | Yes | Yes | No |
| Delivery receipts | Yes | Yes | No |
| Typing indicators | Yes | No | No |
| Reactions/tapbacks | Yes | Yes | No |
| Message effects | Yes | No | No |
| Group chats | Yes | Yes | MMS |
| Message threading | Yes | No | No |
| Rich link previews | Yes | Yes | No |
| Voice memos | Yes | Yes | No |
| File attachments (100MB) | Yes | Limited | No |
| Text decorations | Yes | No | No |
| Location sharing | Yes | No | No |

Important corollary: **SMS/MMS sends never produce `message.delivered` or `message.read`
webhooks** — you'll only see `message.sent` and (on hard failure) `message.failed`. Treat a
missing delivered/read event on an SMS-fallback send as expected, not a bug.

### Capability checks — rate-limited, use before pinning `iMessage`

- `POST /v3/capability/check_imessage`
- `POST /v3/capability/check_rcs`
- Both limited to 1 call per 10 seconds (per number, per the Rate Limits doc). Cache results for
  minutes, not days — capability is stable short-term.

---

## 7. Webhooks

### Subscription management — `POST/GET/PUT(?)/DELETE /v3/webhook-subscriptions`

Create:
```bash
curl -X POST https://api.linqapp.com/api/partner/v3/webhook-subscriptions \
  -H "Authorization: Bearer $LINQ_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "target_url": "https://webhooks.example.com/linq/events?version=2026-02-03",
    "subscribed_events": ["message.sent", "message.delivered", "message.read"],
    "phone_numbers": ["+12025551234"]
  }'
```
- Response includes `signing_secret` (`whsec_`-prefixed, base64 random bytes) — **shown once,
  cannot be retrieved later**; to rotate, delete + recreate the subscription.
- `target_url` must be unique per account — differentiate multiple subscriptions with query
  params (`?line=support`).
- `phone_numbers` (optional array) filters events to specific lines; omit for all lines.
- List / Retrieve / Update / Delete all exist as separate endpoints (exact HTTP verbs beyond
  Create/Delete are only referenced via API-reference links, not spelled out inline — infer
  `GET` list/retrieve, `PATCH` or `PUT` update, `DELETE` delete, matching REST convention used
  elsewhere in the docs). Update: omitted fields keep prior values; signing secret **cannot** be
  changed via update. Pause by setting `is_active: false`.

### Versioning

`?version=YYYY-MM-DD` query param on the `target_url`. Two known versions: `2025-01-01`
(legacy/default for pre-2026-02-03 subscriptions) and `2026-02-03` (current; adds `chat` nested
object w/ `health_status` on message events, and is required for `message.edited` delivery). If
omitted, subscription uses latest version available at creation time. **Always pin a version
explicitly.**

### Headers (every delivery carries BOTH sets)

**Standard Webhooks (recommended, use this):**

| Header | Meaning |
|---|---|
| `webhook-id` | Unique event id — use as idempotency/dedup key |
| `webhook-timestamp` | Unix seconds when webhook was sent |
| `webhook-signature` | `v1,<base64>` (space-separated if multiple) |

**Legacy (deprecated but still sent, back-compat only):**
`X-Webhook-Event`, `X-Webhook-Subscription-ID`, `X-Webhook-Timestamp`, `X-Webhook-Signature`
(hex-encoded HMAC-SHA256, different encoding from the new headers — don't mix the two schemes).

### ⚠️ Which scheme Belle actually uses (verified against the shipped adapter)

Linq sends **both** header sets on every delivery. The `@linqapp/chat-sdk-adapter`
package Belle uses verifies the **legacy** scheme, not Standard Webhooks. Verified
by reading `node_modules/@linqapp/chat-sdk-adapter/dist/verification.js` and by
live-testing the production endpoint (valid → 200, forged → 401, 1h-old → 401):

- Headers: `x-webhook-timestamp`, `x-webhook-signature`
- Signature encoding: **hex** (an optional `sha256=` prefix is accepted)
- Signed content: `` `${timestamp}.${rawBody}` `` (timestamp, a literal dot, then the raw bytes)
- HMAC key: the **raw secret string including the `whsec_` prefix**, UTF-8 encoded —
  it is NOT base64-decoded and the prefix is NOT stripped
- Freshness window: 300 seconds, compared as `abs(now - timestamp)`

The Standard Webhooks description below is accurate for Linq's own documented
scheme and for anyone verifying webhooks directly, but do not use it to test the
adapter-backed endpoint — it will 401 with "Missing Linq webhook signature headers".

### Signature verification algorithm (Standard Webhooks spec)

1. Extract `webhook-id`, `webhook-timestamp`, `webhook-signature` headers.
2. **Reject if `webhook-timestamp` is more than 5 minutes old** (replay protection) — compare
   against wall clock: `abs(now_seconds - webhook_timestamp) > 300` → reject.
3. Read the **raw** request body bytes — do not parse-then-reserialize JSON, the signature is
   computed over the exact bytes sent.
4. Signed content = `"{webhook-id}.{webhook-timestamp}.{raw_body}"`.
5. Strip `whsec_` prefix from your signing secret, base64-decode the remainder to raw key bytes.
6. `HMAC-SHA256(key_bytes, signed_content)`, base64-encode the digest.
7. Compare (constant-time) against each `v1,<base64>` entry in `webhook-signature` (space-
   separated — supports secret rotation with multiple valid sigs during a transition window).

Node.js reference implementation (from docs, llms-full.txt:8561-8587):
```js
const crypto = require('crypto');
function verifyWebhook(secret, rawBody, headers) {
  const msgId = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signature = headers['webhook-signature'];
  const secretStr = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const keyBytes = Buffer.from(secretStr, 'base64');
  const signedContent = `${msgId}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', keyBytes).update(signedContent).digest('base64');
  return signature.split(' ').some(sig => {
    if (!sig.startsWith('v1,')) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'base64'), Buffer.from(sig.slice(3), 'base64'));
    } catch { return false; }
  });
}
```
If using the official SDK: `client.webhooks.unwrap(rawBody, { headers: req.headers })` does all
of this — throws on invalid signature, returns a typed discriminated event. Reads
`LINQ_WEBHOOK_SECRET` env var by default. **Must pass raw body, not parsed JSON.**

### Delivery guarantees

| Guarantee | Value |
|---|---|
| Response timeout | 10 seconds |
| Retry attempts | 10 per endpoint |
| Retry backoff | Exponential with jitter, capped at 10 minutes |
| Total retry window | ~25 minutes |
| Delivery model | At-least-once (duplicates possible) |

Retried on: HTTP 5xx, HTTP 429, connection timeout, connection refused.
**Not retried:** HTTP 4xx (except 429), DNS failures, invalid hostnames — a non-2xx-non-429-4xx
means Linq gives up on that delivery permanently.

Your endpoint must: (1) return `200` fast, do slow work async; (2) verify signature; (3)
dedupe on `event_id` (== `webhook-id` header value); (4) be idempotent.

### Webhook envelope (all event types)

```json
{
  "api_version": "v3",
  "webhook_version": "2026-02-03",
  "event_type": "message.received",
  "event_id": "2915e81c-5068-4796-ace2-21d2c94ad298",
  "created_at": "2026-02-05T19:31:13.736444093Z",
  "trace_id": "8af9171a45022df2eb74ba4e4c83be0f",
  "partner_id": "your-partner-id",
  "data": { }
}
```
`event_id` = dedup key (same value as `webhook-id` header). `trace_id` = correlates back to the
originating API call's `X-Trace-ID` and threads through the full async lifecycle
(sent→delivered→read / sent→failed).

### Authoritative event type list (llms-full.txt:7051)

`message.sent`, `message.received`, `message.read`, `message.delivered`, `message.failed`,
`message.edited`, `reaction.added`, `reaction.removed`, `participant.added`,
`participant.removed`, `chat.created`, `chat.group_name_updated`, `chat.group_icon_updated`,
`chat.group_name_update_failed`, `chat.group_icon_update_failed`, `chat.background_updated`,
`chat.typing_indicator.started`, `chat.typing_indicator.stopped`, `phone_number.status_updated`,
`call.initiated`, `call.ringing`, `call.answered`, `call.ended`, `call.failed`, `call.declined`,
`call.no_answer`, `location.sharing.started`, `location.sharing.stopped`, `payment.succeeded`,
`payment.canceled`, `payment.expired`, `payment.declined`, `payment.authorized`,
`connection.created`, `connection.revoked`.

(`call.*` and `payment.*`/`connection.*` are for voice-calling and Agentcard payment products
respectively — not needed for Belle's core messaging, but subscribe-able on the same mechanism.)

### `message.sent` payload (2026-02-03; `data`)

```json
{
  "chat": {
    "id": "0c961e93-e7bf-4db2-bf7b-ea06826bcab4",
    "is_group": false,
    "owner_handle": { "handle": "+12025551234", "id": "...", "is_me": true,
      "joined_at": "...", "left_at": null, "service": "iMessage", "status": "active" },
    "health_status": { "status": "HEALTHY", "doc_url": "...", "updated_at": "..." }
  },
  "id": "347d62c2-2170-4754-8d30-c76d0c727d96",
  "idempotency_key": null,
  "direction": "outbound",
  "sender_handle": { "...": "same shape as owner_handle" },
  "parts": [ { "type": "text", "value": "Hello from Linq!" },
             { "type": "media", "filename": "photo.jpg", "id": "...", "mime_type": "image/jpeg",
               "size_bytes": 245678, "url": "https://cdn.linqapp.com/attachments/..." } ],
  "effect": null,
  "sent_at": "2026-02-05T19:52:17.219Z",
  "delivered_at": null,
  "read_at": null,
  "service": "iMessage",
  "preferred_service": null
}
```
(2025-01-01 legacy shape is flatter: `chat_id`, `from`, `from_handle`, `is_from_me`, `is_group`,
nested `message: {...}` object with `is_delivered`/`is_read` booleans instead of the newer
`direction` field. **Belle should target `2026-02-03`.**)

### `message.received` — same envelope shape as `message.sent` but `direction: "inbound"`,
`sender_handle.is_me: false`, plus a `reply_to` field (null unless the inbound message was
itself a reply).

### `message.delivered` / `message.read` — same shape, with `delivered_at`/`read_at` populated.
Fires only on iMessage/RCS (never SMS/MMS — see §6).

### `reaction.added` / `reaction.removed` (`ReactionEventBase`, identical shape across versions)

```json
{
  "chat_id": "550e8400-e29b-41d4-a716-446655440000",
  "message_id": "550e8400-e29b-41d4-a716-446655440001",
  "part_index": 0,
  "reaction_type": "love",
  "custom_emoji": null,
  "is_from_me": false,
  "from": "+14155559876",
  "from_handle": { "id": "...", "handle": "+14155559876", "is_me": false,
    "service": "iMessage", "status": "active", "joined_at": "...", "left_at": null },
  "service": "iMessage",
  "reacted_at": "2025-11-23T17:35:00.000Z",
  "sticker": null
}
```
`reaction_type` ∈ {`love`,`like`,`dislike`,`laugh`,`emphasize`,`question`,`custom`,`sticker`}.

### `chat.created` — `data` mirrors `GET /v3/chats/{chatId}` response: `id`, `display_name`,
`service`, `handles[]` (each with `id`/`handle`/`is_me`/`service`/`status`/`joined_at`/
`left_at`), `is_group`, `created_at`, `updated_at`, and (2026-02-03 only) `health_status`.

### `chat.group_name_updated` / `chat.group_icon_updated` — `{ chat_id, old_value, new_value,
changed_by_handle, updated_at }`. `new_value` null = removed; `old_value` null = none existed.

### `chat.typing_indicator.started`/`.stopped`, `participant.added`/`.removed`,
`phone_number.status_updated` — payload schemas exist in the events page but weren't captured
verbatim in this pass; treat the OpenAPI spec / API reference pages as source of truth for exact
field names before coding against them, or re-fetch `docs.linqapp.com/guides/webhooks/events/`
directly. `phone_number.status_updated` is known to carry both `previous_status`/`new_status`
and `previous_reputation`/`new_reputation` (fires when *either* changes).

---

## 8. Chat health & phone reputation (compliance-critical)

`chat.health_status.status` ∈ `HEALTHY`, `AT_RISK`, `CRITICAL`, `OPTED_OUT`.

- **OPTED_OUT is terminal** — recipient sent an opt-out keyword; do not send further outbound to
  that chat until Linq clears it (Linq clears automatically on an opt-in keyword *or* sustained
  two-way conversation resuming — don't try to track this state yourself, just poll/react to
  `health_status`).
- Opt-out keywords (exact, case-sensitive match against inbound text): `STOP`, `UNSUBSCRIBE`,
  `OPTOUT`, `CANCEL`, `END`, `QUIT`.
- Opt-in keywords (clears opt-out): `START`, `OPTIN`, `UNSTOP`.
- **Linq does not suppress sends on your behalf** — your application must gate on
  `health_status` before every send, or scan `message.received` for these keywords itself as a
  belt-and-suspenders check.
- `AT_RISK`/`CRITICAL` are soft warnings — slow/pause outbound respectively, don't migrate the
  user to a different line to dodge the status.
- New chats start `HEALTHY`.

---

## 9. Contact cards & onboarding

- `POST /v3/contact_card` (one-time per line), `PATCH /v3/contact_card` for later edits,
  `GET /v3/contact_card` retrieve.
- `POST /v3/chats/{chatId}/share_contact_card` — pushes the iMessage native "save name & photo"
  prompt. Requires: card exists + `is_active: true`, chat is iMessage, ≥1 prior outbound message
  in that chat. Re-share ~once/day (no delivery confirmation). This is *not* a vCard attachment —
  to send an actual `.vcf` file, attach it as a media part instead.
- `GET /v3/available_number` — for onboarding a *new* user only (not per-message): returns the
  best available line + its `vcf_url` to spread new users evenly across the pool.
- **Sending flow best practice:** call `POST /v3/messages` (or `POST /v3/chats`) with `to` and
  **no `from`** for ongoing sends — Linq auto-selects/load-balances/fails-over the best line.
  Only use `available_number` at onboarding time, not per-send. (This "no `from`" pattern
  appears in the best-practices audit prompt but conflicts with the Quickstart/Sending Messages
  examples which always pass `from` explicitly — reconcile against your actual line-management
  strategy; if you operate a single line, always passing `from` is simpler and equally correct.)

---

## 10. Rate limits, retries, debugging

- Trace ID: `X-Trace-ID` response header (32-hex), also `trace_id` in every error body and
  webhook envelope. Client-sent `traceparent`/`tracestate` are ignored server-side.
- Correlate: store `trace_id` returned from your `POST /v3/chats/{id}/messages` call alongside
  your outbound message record; the same `trace_id` shows up on the resulting `message.sent` →
  `message.delivered`/`message.read` (or `message.failed`) webhooks. Use `event_id` for
  dedup, `trace_id` for end-to-end correlation — they serve different purposes.
- 429 body includes `retry_after` (seconds); prefer the `Retry-After` header, fall back to
  exponential backoff (1s→2s→4s...) with an upper retry bound.
- SDKs handle retry/backoff automatically; direct API callers must implement it.

---

## 11. Vercel Chat SDK adapter

- Package: `@linqapp/chat-sdk-adapter` (peer dep on Vercel's `chat` package). Install:
  `npm install @linqapp/chat-sdk-adapter chat`.
- Source: `github.com/linq-team/linq-chat-sdk`, built/maintained by Linq.
- Usage:
```ts
import { createLinqAdapter } from "@linqapp/chat-sdk-adapter";
import { Chat } from "chat";

const chat = new Chat({
  userName: "mybot",
  adapters: {
    linq: createLinqAdapter({
      apiKey: process.env.LINQ_API_KEY!,
      signingSecret: process.env.LINQ_WEBHOOK_SECRET!,
    }),
  },
});

chat.onDirectMessage(async (thread, message) => {
  await thread.subscribe();
  await thread.post(`you said: ${message.text}`);
});

chat.onReaction(["thumbs_up"], async (event) => {
  await event.thread.post("appreciate the tapback 🫡");
});

// route webhooks:
export default async (request: Request) => chat.webhooks.linq(request);
```
- Config options: `apiKey` (required), `signingSecret` (required — inbound requests verified
  with HMAC-SHA256 over `{timestamp}.{body}` with replay protection, i.e. the adapter does the
  Standard Webhooks verification internally), `baseURL` (optional override).
- **Webhook-driven** — you still create a Linq webhook subscription pointed at the adapter's
  route, subscribed to at minimum: `message.received`, `reaction.added`, `reaction.removed`.
  Any event type the adapter doesn't handle is acked `200` and ignored.
- **What the adapter supports** (maps onto Chat SDK's thread/message/reaction model —
  `thread.post`, `thread.subscribe`, `onDirectMessage`, `onNewMessage`, `onReaction` work
  unchanged):
  - Text: inbound + outbound, DMs and group chats.
  - Media: inbound images/audio/files arrive as attachments; outbound `attachments`/`files`
    sent as media parts (URL reference or pre-uploaded for large/raw files).
  - Reactions: iMessage tapbacks ↔ Chat SDK emoji, both directions (table below).
  - Typing indicators: **DMs only** (Linq itself rejects typing indicators in group chats — see
    §4).
  - Edits: outbound message text can be edited (subject to the underlying 5-edits/15-min limit).
  - Thread IDs are stable: always `linq:{chatId}` — same thread whether reached via webhook or
    API, regardless of entry point.
  - Streaming is **buffered** — recipient only sees the final message, not token-by-token.
- **What's NOT supported by the adapter (requires direct Linq V3 API calls instead):**
  - Stickers, message deletion, and "modals" — no iMessage equivalent, not supported at all.
  - Message effects (confetti/fireworks/etc.) — not part of the Chat SDK abstraction; must call
    `POST /v3/chats/{chatId}/messages` directly with an `effect` object.
  - Text decorations (bold/shake/etc.) — same, iMessage-only, not modeled by Chat SDK.
  - Group chat management (name/icon, add/remove participant, leave) — not part of Chat SDK's
    generic thread model; use `PUT /v3/chats/{chatId}` and participant endpoints directly.
  - Location sharing, contact-card sharing, voice memos, rich link previews, protocol
    pinning (`preferred_service`), capability checks, chat-health/phone-reputation
    inspection, idempotency-key control — none of these map onto generic Chat SDK primitives;
    all require direct V3 API calls.
  - Reply-to/threading beyond the adapter's own thread model (if you need `reply_to` +
    `part_index` targeting a specific message part) — direct API.

### Reaction mapping (adapter, both directions)

| Linq tapback | Chat SDK emoji |
|---|---|
| `like` | `thumbs_up` |
| `dislike` | `thumbs_down` |
| `love` | `heart` |
| `laugh` | `laugh` |
| `emphasize` | `exclamation` |
| `question` | `question` |

Custom emoji reactions pass through a default resolver (e.g. `👍` → `thumbs_up`); anything
unmapped falls back to the raw emoji.

---

## 12. Gaps / things to verify before writing code

- Exact HTTP verb + path for: webhook-subscription List/Retrieve/Update (only inferred from
  REST convention + reference links, not shown as literal `curl` examples the way Create/Delete
  are elsewhere).
- Exact path for "mark chat as read" (`POST /v3/chats/{chatId}/mark_as_read` inferred from
  naming convention, not shown literally).
- Exact path/verb for message edit (`update`) and delete — only linked via
  `/api/resources/messages/methods/update` and `.../delete`, not shown as literal `curl`.
- Two conflicting body shapes for `POST /v3/chats/{chatId}/messages` (flat vs. nested under
  `message`) — confirm against the OpenAPI spec / SDK TypeScript types
  (`node_modules/@linqapp/sdk`) rather than guessing.
- `chat.typing_indicator.*`, `participant.added/removed`, `phone_number.status_updated` webhook
  payload field names beyond what's summarized in §7 — re-fetch
  `docs.linqapp.com/guides/webhooks/events/` in full or inspect the SDK's generated types before
  coding a parser.
- Env var name for the SDK's default API key (`LINQ_API_KEY` used almost everywhere,
  `LINQ_API_V3_API_KEY` mentioned once) — pass `apiKey` explicitly to sidestep this.
