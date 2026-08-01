import { defineAgent } from "eve";

export default defineAgent({
  model: "anthropic/claude-sonnet-5",
  // Belle's root session is conversational: resolve context, pick a tool,
  // reply in a couple of sentences. Measured turns were 9-15s, and heavy
  // deliberation on a texting surface costs latency without improving
  // answers. Deep analysis happens in the reviewer/fixer subagents, which
  // keep the provider default. Providers that don't honor a level ignore it.
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
