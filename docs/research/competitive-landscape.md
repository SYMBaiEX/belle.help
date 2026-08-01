# Competitive Landscape

Researched 2026-07-31 by direct fetch of live pricing/marketing pages (general
web search engines were bot-blocked this session; every price below carries its
source page). Items that could not be verified are flagged.

## Category map

Belle sits at the intersection of three categories that today do not overlap:

1. **AI PR review** (CodeRabbit, Greptile, Graphite, Qodo, Bito, Copilot code review)
2. **Autonomous coding agents** (Devin, Copilot coding agent, Codex, Cursor background agents, Vercel Agent, Sweep)
3. **Textable personal agents** (Lindy, Poke, Soar, Tomo, Jarvie — several distributed through Linq's own iMessage Agent Store)

No product verified this session combines a phone-number-native interface with
GitHub operator authority (review → fix → merge with approval).

## Competitors

### GitHub Copilot coding agent — the distribution king
- **Target:** every GitHub user. **Interface:** GitHub UI/IDE. **Use case:** assign issues/PRs to an agent, code review.
- **Pricing (github.com/features/copilot/plans):** Free (2,000 completions); Pro $10/u/mo ($15 credits); Pro+ $39 ($70 credits, premium models); Max $100 ($200 credits).
- **Approval model:** PR-based; humans review agent PRs.
- **Strengths:** native distribution, price. **Weaknesses:** GitHub-UI-bound, no proactive watching, no messaging surface.
- **Belle vs:** Belle reaches you where GitHub can't — your Messages app — and asks before acting.

### Cursor (background/cloud agents + Bugbot)
- **Pricing (cursor.com/pricing):** Hobby free; Pro $20/mo; Pro+/Ultra usage-tiered; Teams $40/u/mo (Bugbot review); Enterprise custom.
- **Strengths:** strongest dev mindshare, deep IDE integration. **Weaknesses:** IDE-first; agents are launched, not resident; no phone surface, no repo watching.
- **Belle vs:** Belle is resident and reachable without a laptop.

### Devin (Cognition)
- **Pricing (devin.ai/pricing):** Free; Pro $20/mo; Max $200/mo; Teams $80 base + $40/seat; Enterprise (VPC, SSO). Usage-metered per task.
- **Execution model:** closest to Belle's fix loop — autonomous end-to-end task execution in cloud sandboxes.
- **Strengths:** mature autonomous execution. **Weaknesses:** dashboard/Slack-first, expensive at scale, no explicit approval-bound merge semantics like SHA-pinning.
- **Belle vs:** Belle's approvals are cryptographically narrow (user+repo+PR+head SHA+expiry) and the whole loop fits in a text thread.

### CodeRabbit — most mature standalone AI PR review
- **Pricing (coderabbit.ai/pricing):** Free (summaries); Pro $24/u/mo; Pro Plus $48; Enterprise (self-host). Slack agent $0.50/agent-minute.
- **Strengths:** review depth, market traction. **Weaknesses:** review-only posture — comments on PRs, doesn't operate them; noise complaints are common.
- **Belle vs:** Belle reviews *when asked or configured*, avoids comment spam by policy, and can carry the finding through fix → CI → merge.

### Greptile
- **Pricing (greptile.com/pricing):** Starter free (50 credits); Pro $30/seat/mo; Enterprise (self-host). OSS free.
- Codebase-graph-aware review. Review-only; no merge authority, no messaging surface.

### Graphite
- **Pricing (graphite.dev/pricing):** Hobby free; Starter $20/u/mo; Team $40/u/mo (unlimited AI review, merge queue); Enterprise. Now bundles Cursor Cloud Agents into the PR flow.
- Stacked-PR workflow + merge queue is its moat. Dashboard-bound.

### Bito
- **Pricing (bito.ai/pricing):** AI Code Review Team $12–15/seat/mo (5K lines/seat included, $5/1K after); "AI Architect" autonomous tier usage-based.
- Budget review option; agentic tier is early.

### Qodo — not re-verified this session (fetch skipped); historically PR-test-and-review focused with free + team tiers. Flag: verify before citing.

### Sweep — GitHub-issue→PR bot; largely superseded by Copilot coding agent. Low current threat.

### OpenAI Codex
- Pricing page is a JS shell (unfetchable via curl); bundled with ChatGPT Plus/Pro plans per general knowledge — **unverified this session**.
- First-party cloud coding agent; no third-party operator surface (see ADR 003 — its auth is closed to SaaS embedding, which is itself a moat for Belle's BYOK/managed model).

### Vercel Agent — AI code review + production investigation inside Vercel; adjacent, platform-bound, not a GitHub operator.

### GitHub Advanced Security — secret scanning/code scanning; pricing docs URL 404'd this session (legacy ~$30–49/committer/mo from training data — **stale, unverified**). Complementary rather than competitive; Belle's security-review subagent overlaps only at the review margin.

### Textable agents (interface analogs, not code competitors)
- **Lindy (lindy.ai/pricing):** Plus $49.99/mo, Pro $99.99, Max $199.99, Enterprise. iMessage/SMS chat, 100+ integrations, computer use. Zero code/GitHub specialization. The strongest pricing analog for "agent you text."
- **Linq iMessage Agent Store:** Tomo, Body Buddy, Lindy, Soar, Poke, Jarvie, Miora are live textable agents on Belle's own messaging provider — validates the pattern; none are GitHub-focused.
- **Boardy:** AI networking superconnector via text; no public pricing; validates UX only.
- **Zo Computer (zo.computer/pricing):** Free / Basic $18 / Pro $64 / Ultra $200 (personal cloud computer with AI credits). General-purpose, not GitHub-operator.
- **Agent Card (agentcard.co):** live site is now a verified-professional marketplace ("where verified agents do real work") — **the textable-AI product appears pivoted/defunct; unverified**.

## Belle's differentiation (grounded in the above)

1. **Surface:** the only GitHub operator reachable by texting a phone number — no app, no dashboard required for the core loop (dashboard exists for depth).
2. **Authority with consent:** review → fix → merge as one conversation, every consequential step behind explicit approval bound to user + repo + PR + head SHA + expiry. Competitors either only comment (review tools) or act with coarse approval (agents).
3. **Residency:** Belle watches repos and initiates contact under strict notification policy; IDE agents wait to be invoked.
4. **Anti-noise stance:** review-on-request/policy, findings held to evidence standards, bundled notifications — a direct answer to CodeRabbit-style comment fatigue.

## Risks
- Copilot's distribution and price gravity ($10/mo) caps what "review" alone can charge; Belle must sell the *operator loop*, not reviews.
- The texting surface must prove more valuable than GitHub mobile notifications — onboarding and notification quality are the product.
- Linq platform dependency (pricing unpublished; see unit-economics).
