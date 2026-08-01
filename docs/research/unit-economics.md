# Unit Economics

Modeled 2026-07-31. Prices verified by direct fetch where noted; estimates are
flagged. Linq publishes no self-serve pricing (contact-sales only), so
messaging costs are proxied from comparable dedicated-line iMessage API
providers: Sendblue ($100/mo dedicated line, flat, no per-message fee) and
LoopMessage ($59.99–$99.99/mo + $15/mo dedicated number + $15/mo SMS/RCS
fallback). **Planning assumption: $60–150/mo per dedicated Belle line,
flat-rate.** A single line serves many users (Linq soft cap ~7,000
messages/day/line; hard cap 30 msgs/60s per recipient pair), so per-user
messaging cost is driven by line amortization + SMS fallback carrier fees.

## Cost model (per active user / month)

Assumptions: 20 watched-PR notifications, 12 reviews, 3 fix runs, 2 merges,
~120 outbound + 80 inbound messages.

| Item | Basis | Est. cost |
|---|---|---|
| Messaging line share | $100/mo line ÷ ~75 active users/line | $1.35 |
| SMS fallback overage | carrier pass-through, minority of traffic | $0.30 |
| Conversational turns (agent loop) | small/frontier mix via AI Gateway, ~200 turns × ~3k in/300 out avg | $1.50–3.00 |
| PR reviews | 12 × (50–150k in / 5–10k out). Frontier-heavy: $0.15–1.50/review → staged: small-model triage + frontier on high-risk files | $3.60–9.00 |
| Fix runs (sandbox + inference) | 3 × ($0.30–1.00 inference + Vercel Sandbox active-CPU ~$0.05–0.15) | $1.05–3.45 |
| Vercel Functions/Workflows | Fluid active-CPU; webhook + agent orchestration | $0.50–1.50 |
| Convex | Pro $25/dev/mo fixed + usage; marginal per user | $0.10–0.30 |
| Observability | logs/OTel export share | $0.10–0.25 |
| GitHub API | free (rate limits only) | $0 |
| Support/abuse buffer | 10% of subtotal | ~$0.85–1.90 |
| **Total marginal cost** | | **≈ $9.35–21.05** |

BYOK users shift the inference lines ($5–12) to their own OpenAI bill,
dropping Belle's marginal cost to **≈ $4–9**. AI Gateway adds no fee on BYOK
(verified on vercel.com docs: "no markup or fee" with BYOK); the managed-path
markup percentage is not publicly disclosed — treated as small but nonzero.

Fixed platform floor (independent of users): Vercel Pro ~$20/mo, Convex Pro
$25/mo, Linq line(s) $60–150/mo, domain ~$1/mo → **≈ $105–200/mo**.

## Packaging

| Tier | Price | Includes | Marginal cost | Gross margin |
|---|---|---|---|---|
| **Personal** | $19/mo (BYOK) / $29 (managed AI) | 2 repos, 30 reviews/mo, manual review approval, text notifications | $4–9 BYOK / $9–15 managed | ~55–75% |
| **Pro** | $59/mo | 10 repos, auto-review, fixes, CI monitoring, daily digest, extended memory | $12–21 | ~64–80% |
| **Team** | $49/seat/mo (min 3) | org installation, shared policies, team approvals, audit history, usage controls, pooled review quota | pooled | ~65% target |
| **Security** | custom (from $500/mo) | security-focused reviews, compliance exports, risk dashboard, custom policies | amortized | highest, but do not model >75% blended |

Positioning: Personal undercuts Lindy Plus ($49.99) while being code-specialized;
Pro sits beside CodeRabbit Pro Plus ($48) and Cursor Pro ($20) but sells the
operator loop, not just review; Team matches the Cursor Teams / Graphite Team
$40–49/seat band.

## Guardrails (must be enforced in product, not just priced)

- Per-user monthly review/fix quotas; hard spending limit per user on managed
  inference (usageEvents + gate before model call).
- Message throttling + bundling (Linq hard cap 30/60s/recipient makes this
  mandatory anyway).
- Large-PR staged analysis to cap tokens per review.
- Never claim zero inference cost: BYOK moves cost, it doesn't remove it —
  ChatGPT-subscription-backed execution is **not** available to Belle (ADR 003).

## Unverified items to re-check before launch pricing

- Actual Linq contract pricing (sales conversation required).
- AI Gateway managed markup %.
- OpenAI Codex bundling and GHAS current pricing (fetch failed this session).
