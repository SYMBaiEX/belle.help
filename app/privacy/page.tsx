import { LegalLayout } from "@/components/LegalLayout";

export const metadata = { title: "Privacy — Belle" };

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy" updated="July 31, 2026">
      <p>
        Belle is a GitHub agent you talk to by text. This page explains, plainly, what we store
        about you, why, and how to get rid of it.
      </p>

      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          What we store
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            <strong style={{ color: "var(--color-ink)" }}>Your phone number, hashed —</strong> we
            never store your raw phone number as a lookup key. We keep an HMAC hash (for matching
            you to your account) and the last 4 digits (so you can recognize your own number in
            settings).
          </li>
          <li>
            <strong style={{ color: "var(--color-ink)" }}>Your OpenAI API key, encrypted —</strong>{" "}
            if you bring your own key, it&apos;s encrypted at rest with AES-256-GCM. We store the
            ciphertext, not the plaintext, and we never redisplay the full key after you save it —
            only a masked <code>sk-…</code> plus the last 4 characters.
          </li>
          <li>
            <strong style={{ color: "var(--color-ink)" }}>Repository metadata —</strong> repo
            names, PR titles/numbers/diffstat, branch names, and review findings for repos you
            explicitly connect and watch. We don&apos;t store your source code beyond what&apos;s
            needed to run a review or fix in a sandbox.
          </li>
          <li>
            <strong style={{ color: "var(--color-ink)" }}>An audit log —</strong> every action
            Belle takes (reviews, fixes, approvals, merges) is logged with a timestamp so you can
            see exactly what happened and why.
          </li>
          <li>
            <strong style={{ color: "var(--color-ink)" }}>Conversation context —</strong> which
            repo/PR you were last talking about, so you can say &quot;fix it&quot; without
            repeating yourself.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          Providers we use
        </h2>
        <p className="mt-2">
          Belle&apos;s infrastructure runs on <strong style={{ color: "var(--color-ink)" }}>Vercel</strong>{" "}
          (hosting), <strong style={{ color: "var(--color-ink)" }}>Convex</strong> (database), and{" "}
          <strong style={{ color: "var(--color-ink)" }}>Linq</strong> (iMessage/RCS/SMS messaging
          delivery). If you use your own key, inference calls go directly to{" "}
          <strong style={{ color: "var(--color-ink)" }}>OpenAI</strong> billed to your account; if
          not, they route through Belle&apos;s managed inference gateway. Each provider processes
          only what&apos;s needed to perform its function and is bound by its own data-handling
          terms.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          Your rights
        </h2>
        <p className="mt-2">
          You can revoke your API key, disconnect a repository, or delete your account at any time
          from Settings. Deleting your account revokes your encrypted credentials, disables
          watching on all repositories, deletes your stored memories and conversation context, and
          marks your account record deleted. It does not uninstall the GitHub App (do that on
          GitHub directly) or delete message history on Linq&apos;s side, which follows Linq&apos;s
          own retention policy.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          Contact
        </h2>
        <p className="mt-2">
          Questions about this policy — text Belle, or reach out through the channel that sent you
          here.
        </p>
      </section>
    </LegalLayout>
  );
}
