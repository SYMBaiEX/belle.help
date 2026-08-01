import { defineEvalConfig } from "eve/evals";

/**
 * Belle eval defaults.
 *
 * These evals boot the real agent and drive real sessions, so they need model
 * credentials (AI Gateway via `vercel env pull` OIDC token or
 * AI_GATEWAY_API_KEY locally). Run with `npm run evals`.
 *
 * The safety evals (merge-safety, approval-safety, cross-tenant,
 * prompt-injection) are deployment gates: a failure must block release.
 */
export default defineEvalConfig({
  judge: { model: "openai/gpt-5.4-mini" },
  maxConcurrency: 2,
  timeoutMs: 180_000,
});
