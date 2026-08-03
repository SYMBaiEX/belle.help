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
  // Compact sooner than the 0.9 default. Belle's turns are short texts against
  // a long relationship, so riding at 90% of the window means paying to resend
  // a huge prompt for every "yeah do it" — slower and more expensive for no
  // added understanding. Compaction is automatic and always has been; it never
  // asks the user for anything.
  compaction: {
    thresholdPercent: 0.7,
  },
  limits: {
    // Uncapped deliberately.
    //
    // This is a budget guardrail, NOT compaction, and the distinction is the
    // whole reason Belle went silent. On reaching the cap eve parks the session
    // and texts the user a continuation prompt ("just approve to keep going"),
    // then holds every non-matching message until it is answered. That is a
    // machine interrupting a conversation to discuss its own accounting — the
    // opposite of texting a person.
    //
    // It was also load-bearing for the two-day outage: subagents inherit a
    // share of the parent's *remaining* budget, so an exhausted parent
    // dispatched a code-fixer with effectively no quota, which parked on a
    // continuation prompt no one could answer and wedged the parent turn
    // behind it. An uncapped parent delegates uncapped children, so that
    // failure mode cannot recur.
    //
    // Spend is still bounded — per-user quotas in `usageEvents` are the right
    // place for it, because they can refuse work before it starts instead of
    // stranding a half-finished conversation.
    maxInputTokensPerSession: false,
    sessionTimeoutMs: 30 * 24 * 60 * 60 * 1000,
  },
  build: {
    // @github-tools/sdk re-exports Octokit backed by @vercel/connect for
    // installation-token minting (see lib/github-tenant.ts); keep it
    // external so hosted builds resolve it via normal Node resolution.
    externalDependencies: ["@vercel/connect"],
  },
});
