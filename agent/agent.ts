import { defineAgent } from "eve";

export default defineAgent({
  // Root session: routing a text, resolving context, and replying in a couple
  // of sentences. Fast and cheap matters more here than deep reasoning, and
  // this is the model the owner selected.
  model: "deepseek/deepseek-v4-flash",
  // Measured turns were 9-15s; heavy deliberation on a texting surface costs
  // latency without improving answers. Deep analysis happens in the reviewer /
  // security / fixer subagents, which keep a stronger model. Providers that do
  // not honor a level ignore it.
  reasoning: "low",
  limits: {
    // eve's default is 40M input tokens per session. The previous 2M was 20x
    // lower and wrong for this product: a Belle conversation is a texting
    // relationship that runs for weeks, so the budget guardrail fired, parked
    // the session on a continuation prompt, and — because eve holds
    // non-matching text until a pending input request is answered — silently
    // swallowed every message after it. The user saw an agent that had simply
    // stopped replying.
    //
    // Cost is controlled per user through usageEvents and quotas, not by
    // strangling the conversation. Compaction (default 0.9) keeps context in
    // range long before this ceiling matters.
    maxInputTokensPerSession: 40_000_000,
    sessionTimeoutMs: 30 * 24 * 60 * 60 * 1000,
  },
  build: {
    // @github-tools/sdk re-exports Octokit backed by @vercel/connect for
    // installation-token minting (see lib/github-tenant.ts); keep it
    // external so hosted builds resolve it via normal Node resolution.
    externalDependencies: ["@vercel/connect"],
  },
});
