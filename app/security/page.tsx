import { LegalLayout } from "@/components/LegalLayout";

export const metadata = { title: "Security — Belle" };

export default function SecurityPage() {
  return (
    <LegalLayout title="Security" updated="July 31, 2026">
      <p>
        Belle acts on your codebase, so security isn&apos;t a section at the bottom of the docs —
        it&apos;s the design. Here&apos;s exactly what protects you.
      </p>

      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          Webhook signature verification
        </h2>
        <p className="mt-2">
          Every inbound event — from GitHub or from Linq — is verified against its provider&apos;s
          signature before Belle processes it. Unsigned or mis-signed events are rejected and
          never reach agent logic.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          Encrypted credentials
        </h2>
        <p className="mt-2">
          If you bring your own OpenAI API key, it&apos;s encrypted at rest with AES-256-GCM using
          a key never stored alongside the ciphertext. Only a masked identifier (kind + last 4
          characters) is ever shown back to you — the full key is not retrievable through the UI
          after you save it.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          Isolated sandboxes
        </h2>
        <p className="mt-2">
          Approved fixes run in an isolated sandbox environment, not against your production
          systems or long-lived infrastructure. The sandbox is created for the fix run and
          discarded after.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          Short-lived GitHub tokens
        </h2>
        <p className="mt-2">
          Belle authenticates to GitHub as an installed App, minting short-lived installation
          tokens scoped to the minimum permissions needed for the action at hand, rather than
          holding a long-lived personal access token.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          Explicit, SHA-bound approvals
        </h2>
        <p className="mt-2">
          Nothing merges, and no fix ships, without an approval tied to the exact commit SHA it
          was reviewed against. If the branch moves after you approve, the approval no longer
          matches and Belle asks again rather than silently applying it to a different commit.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          Full audit trail
        </h2>
        <p className="mt-2">
          Every review, fix, approval decision, and merge Belle performs is recorded with a
          timestamp and viewable in your dashboard&apos;s audit log — nothing happens off the
          record.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          Reporting a concern
        </h2>
        <p className="mt-2">
          If you find a security issue, tell us right away through the channel that connected you
          to Belle — we&apos;ll prioritize it.
        </p>
      </section>
    </LegalLayout>
  );
}
