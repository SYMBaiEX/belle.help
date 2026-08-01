import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ConversationPreview } from "@/components/ConversationPreview";

const phoneNumber = process.env.NEXT_PUBLIC_BELLE_PHONE_NUMBER;

const capabilities = [
  {
    title: "Watches your repos",
    body: "Belle listens for new PRs, pushes, and CI results the moment they happen — no polling, no dashboards to refresh.",
  },
  {
    title: "Reviews pull requests",
    body: "Full code review with severity and confidence ratings, blocking issues called out clearly, evidence attached.",
  },
  {
    title: "Security review",
    body: "A dedicated pass for auth, injection, secrets, and access-control mistakes before they ship.",
  },
  {
    title: "CI investigation",
    body: "When a check fails, Belle reads the logs and tells you why in plain language — not just \"build failed.\"",
  },
  {
    title: "Sandboxed fixes",
    body: "Approved fixes run in an isolated sandbox, get typechecked and tested, then get pushed as a real commit.",
  },
  {
    title: "SHA-bound merge approval",
    body: "Merges are tied to the exact commit you approved — if the branch changes underneath, Belle asks again.",
  },
  {
    title: "Full audit trail",
    body: "Every review, fix, approval, and merge is logged and viewable on the dashboard, forever.",
  },
  {
    title: "Quiet hours",
    body: "Set hours where Belle holds notifications and digests them instead of texting you at 2am.",
  },
];

const autonomyLevels = [
  { level: 0, label: "Watch only", body: "Belle observes and reports. No reviews, no actions." },
  { level: 1, label: "Review on request", body: "Belle reviews when you ask her to, in the conversation." },
  { level: 2, label: "Auto-review", body: "Belle reviews every new PR automatically and messages you the results." },
  { level: 3, label: "Approved fixes", body: "Belle can fix approved issues in a sandbox, but never merges without asking." },
  { level: 4, label: "Full autonomy within guardrails", body: "Belle can merge, but only a SHA-bound approval unlocks it — every time." },
];

const faqs = [
  {
    q: "Does Belle merge without asking?",
    a: "No — never. Every merge requires an explicit approval tied to the exact commit SHA Belle reviewed. If the branch changes after you approve, Belle asks again.",
  },
  {
    q: "Which messaging apps does Belle work with?",
    a: "iMessage, RCS, and SMS, through Linq. Belle meets you wherever your phone already texts.",
  },
  {
    q: "Can I use my own OpenAI key?",
    a: "Yes. Bring your own OpenAI API key (encrypted at rest, never shown again after you save it) and Belle uses it for your inference, billed directly to your OpenAI account.",
  },
  {
    q: "Can Belle use my ChatGPT subscription?",
    a: "No. OpenAI doesn't currently offer a supported way for third-party apps like Belle to bill inference to a customer's ChatGPT subscription — only to an API key or Belle's own hosted plan. We'd rather tell you that plainly than fake it.",
  },
  {
    q: "What happens if I don't connect a key?",
    a: "Belle falls back to Belle-hosted inference during early access, with usage limits. You can switch to your own key at any time from Settings.",
  },
  {
    q: "How does Belle authenticate me on the web dashboard?",
    a: "There's no password. The onboarding link Belle texts you is the sign-in — possession of your phone number is the authentication factor. Passkeys and magic links are on the roadmap.",
  },
  {
    q: "What does Belle store about me?",
    a: "A hash of your phone number (never the raw number), your encrypted API key if you provide one, repository metadata, and an audit log of what Belle did. See /privacy for the full list.",
  },
  {
    q: "Can I disconnect Belle?",
    a: "Yes, at any time — pause or disconnect a repo from Settings, or uninstall the GitHub App directly on GitHub to fully revoke access.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteNav />

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-16 md:grid-cols-2 md:items-center md:pt-24">
          <div>
            <h1
              className="text-4xl leading-[1.08] tracking-tight sm:text-5xl"
              style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}
            >
              Your GitHub agent is one text away.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              Belle watches your repositories, reviews pull requests, fixes approved issues, and
              helps you merge safely through iMessage, RCS, or SMS.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              {phoneNumber ? (
                <a
                  href={`sms:${phoneNumber}`}
                  className="rounded-full px-6 py-3 text-sm font-semibold shadow-soft transition-transform hover:scale-[1.02]"
                  style={{ background: "var(--color-accent)", color: "var(--color-accent-ink)" }}
                >
                  Text Belle
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-full px-6 py-3 text-sm font-semibold opacity-60"
                  style={{ background: "var(--color-surface)", color: "var(--color-ink-muted)" }}
                >
                  Number coming soon
                </button>
              )}
              <a
                href="#how-it-works"
                className="text-sm font-medium underline-offset-4 hover:underline"
                style={{ color: "var(--color-ink)" }}
              >
                See how it works
              </a>
            </div>
          </div>

          <div className="flex justify-center md:justify-end">
            <ConversationPreview />
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t px-5 py-20" style={{ borderColor: "var(--color-border)" }}>
          <div className="mx-auto max-w-6xl">
            <h2 className="text-3xl" style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}>
              How it works
            </h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-3">
              {[
                { step: "1", title: "Text Belle", body: "Send a message to start — Belle replies with an onboarding link." },
                { step: "2", title: "Connect GitHub", body: "Install the Belle GitHub App on the repos you want watched." },
                { step: "3", title: "Review, fix & ship — with approval", body: "Belle reviews, fixes what you approve, and merges only what you sign off on." },
              ].map((s) => (
                <div key={s.step} className="rounded-2xl border p-6" style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}>
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold"
                    style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                  >
                    {s.step}
                  </span>
                  <h3 className="mt-4 font-semibold" style={{ color: "var(--color-ink)" }}>
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section className="border-t px-5 py-20" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <div className="mx-auto max-w-6xl">
            <h2 className="text-3xl" style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}>
              What Belle actually does
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {capabilities.map((c) => (
                <div key={c.title} className="rounded-2xl border p-5" style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}>
                  <h3 className="font-semibold" style={{ color: "var(--color-ink)" }}>
                    {c.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
                    {c.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Approval controls */}
        <section className="border-t px-5 py-20" style={{ borderColor: "var(--color-border)" }}>
          <div className="mx-auto max-w-6xl">
            <h2 className="text-3xl" style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}>
              You set the autonomy level
            </h2>
            <p className="mt-3 max-w-2xl text-base" style={{ color: "var(--color-ink-muted)" }}>
              Per repository, choose how much Belle can do on her own — from pure observation to
              acting within guardrails you control.
            </p>
            <div className="mt-10 space-y-3">
              {autonomyLevels.map((a) => (
                <div
                  key={a.level}
                  className="flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-center sm:gap-5"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}
                >
                  <span
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                    style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                  >
                    {a.level}
                  </span>
                  <div>
                    <p className="font-medium" style={{ color: "var(--color-ink)" }}>
                      {a.label}
                    </p>
                    <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
                      {a.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security */}
        <section className="border-t px-5 py-20" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <div className="mx-auto max-w-6xl">
            <h2 className="text-3xl" style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}>
              Built to be trusted with your codebase
            </h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                "Webhook signature verification on every GitHub and Linq event",
                "Credentials encrypted at rest, never displayed again after entry",
                "Isolated sandboxes for every fix — never your production environment",
                "Short-lived GitHub tokens, scoped to the minimum required",
                "Explicit, SHA-bound approvals before anything ships",
                "A full audit trail of every action Belle takes, in your dashboard",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm" style={{ color: "var(--color-ink-muted)" }}>
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--color-accent)" }} />
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/security" className="mt-8 inline-block text-sm font-medium underline-offset-4 hover:underline" style={{ color: "var(--color-ink)" }}>
              Read the full security page →
            </Link>
          </div>
        </section>

        {/* Pricing / early access */}
        <section className="border-t px-5 py-20" style={{ borderColor: "var(--color-border)" }}>
          <div className="mx-auto max-w-2xl rounded-2xl border p-8 text-center shadow-soft" style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-accent)" }}>
              Early access
            </p>
            <h2 className="mt-3 text-2xl" style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}>
              No published pricing yet
            </h2>
            <p className="mt-3 text-sm" style={{ color: "var(--color-ink-muted)" }}>
              Belle is in early access. Text her to join the waitlist and we&apos;ll follow up
              with pricing as your access opens — no fake numbers, no surprise bill.
            </p>
            {phoneNumber ? (
              <a
                href={`sms:${phoneNumber}`}
                className="mt-6 inline-block rounded-full px-6 py-3 text-sm font-semibold"
                style={{ background: "var(--color-accent)", color: "var(--color-accent-ink)" }}
              >
                Text to join
              </a>
            ) : (
              <p className="mt-6 text-sm font-medium" style={{ color: "var(--color-ink-faint)" }}>
                Number coming soon
              </p>
            )}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t px-5 py-20" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl" style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}>
              Frequently asked
            </h2>
            <div className="mt-8 divide-y" style={{ borderColor: "var(--color-border)" }}>
              {faqs.map((item) => (
                <details key={item.q} className="group py-4" style={{ borderColor: "var(--color-border)" }}>
                  <summary className="cursor-pointer list-none font-medium" style={{ color: "var(--color-ink)" }}>
                    {item.q}
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
