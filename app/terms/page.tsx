import { LegalLayout } from "@/components/LegalLayout";

export const metadata = { title: "Terms — Belle" };

export default function TermsPage() {
  return (
    <LegalLayout title="Terms" updated="July 31, 2026">
      <p>
        Belle is in early access. These terms are intentionally short, and will be replaced by a
        full agreement before general availability. By texting Belle or using the dashboard, you
        agree to the following.
      </p>

      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          What Belle does
        </h2>
        <p className="mt-2">
          Belle watches repositories you connect, reviews pull requests, proposes and — with your
          explicit, SHA-bound approval — applies fixes, and merges only what you approve. Belle
          never merges or pushes changes without an approval you gave for that exact action and
          commit.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          Your responsibilities
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>You control which repositories Belle can access via the GitHub App install.</li>
          <li>You&apos;re responsible for reviewing what Belle proposes before approving it.</li>
          <li>If you bring your own OpenAI key, you&apos;re responsible for its usage and billing.</li>
          <li>Don&apos;t use Belle on repositories you don&apos;t have the right to grant access to.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          Early access
        </h2>
        <p className="mt-2">
          Features, limits, and availability may change during early access. We&apos;ll tell you
          in-product, not bury it in a changelog, when something that affects you changes.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          Termination
        </h2>
        <p className="mt-2">
          You can stop using Belle at any time by disconnecting repositories, uninstalling the
          GitHub App, or deleting your account from Settings. We may suspend access for abuse,
          security concerns, or violation of GitHub&apos;s or OpenAI&apos;s own terms of service.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          No warranty
        </h2>
        <p className="mt-2">
          Belle is provided during early access without warranty of any kind. Review everything
          Belle proposes before you approve it — that&apos;s the whole point of the approval step.
        </p>
      </section>
    </LegalLayout>
  );
}
