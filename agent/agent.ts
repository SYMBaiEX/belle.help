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
    maxInputTokensPerSession: 2_000_000,
    sessionTimeoutMs: 30 * 24 * 60 * 60 * 1000,
  },
  build: {
    // @github-tools/sdk re-exports Octokit backed by @vercel/connect for
    // installation-token minting (see lib/github-tenant.ts); keep it
    // external so hosted builds resolve it via normal Node resolution.
    externalDependencies: ["@vercel/connect"],
  },
});
