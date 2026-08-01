import { defaultBackend, defineSandbox } from "eve/sandbox";
import { vercel } from "eve/sandbox/vercel";

// Vercel Sandbox when hosted on Vercel (matches the platform this app
// deploys to); the framework-selected default backend everywhere else
// (Docker → microsandbox → just-bash, per node_modules/eve/docs/sandbox.mdx).
//
// Both branches are typed as `vercel()`'s backend so `defineSandbox` below
// can infer one consistent `onSession` options shape instead of the
// (effectively `never`) intersection TS derives from a bare union of two
// backends with different session-option generics. `networkPolicy` is the
// only option this file passes to `use()`, and it's accepted at session
// creation across every built-in backend (see the sandbox docs' Network
// policy section), so the cast doesn't change what actually runs.
const backend: ReturnType<typeof vercel> = process.env.VERCEL
  ? vercel()
  : (defaultBackend() as ReturnType<typeof vercel>);

export default defineSandbox({
  backend,
  async onSession({ use }) {
    // The GitHub App installation token is minted per call by
    // `../tools/checkout_repository.ts` and `../tools/push_changes.ts` and
    // interpolated directly into the git remote URL for that one command.
    // It is never written to a file, exported as an env var, or otherwise
    // persisted in the sandbox. This is an interim credential path — the
    // production path is firewall-level credential brokering via a
    // per-domain `transform` (see node_modules/eve/docs/sandbox.mdx,
    // "Credential brokering"), which this sandbox does not yet use.
    await use({
      networkPolicy: {
        allow: [
          "github.com",
          "*.github.com",
          "objects.githubusercontent.com",
          "codeload.github.com",
          "registry.npmjs.org",
          "registry.yarnpkg.com",
        ],
      },
    });
  },
});
