import { defineAgent } from "eve";

// `reasoning` is intentionally omitted: the docs (node_modules/eve/docs/
// agent-config.md) don't confirm which effort levels Anthropic's AI SDK
// mapping honors for claude-sonnet-5, so we leave it at the provider
// default rather than guess.
export default defineAgent({
  model: "anthropic/claude-sonnet-5",
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
