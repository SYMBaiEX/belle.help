import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata = { title: "Sign in — Belle" };

const phoneNumber = process.env.NEXT_PUBLIC_BELLE_PHONE_NUMBER;

export default function SignInPage() {
  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-5 py-16 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold"
          style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
        >
          B
        </div>
        <h1 className="mt-5 text-2xl" style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}>
          Sign in by texting Belle
        </h1>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
          Belle doesn&apos;t use passwords. Possessing your phone number is what proves it&apos;s
          you — the onboarding link Belle texts you is also how you sign in to this dashboard the
          first time. After that, you stay signed in on this device.
        </p>

        <div
          className="mt-8 w-full rounded-2xl border p-6"
          style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}
        >
          {phoneNumber ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-faint)" }}>
                Text Belle to get started
              </p>
              <a
                href={`sms:${phoneNumber}`}
                className="mt-3 inline-block rounded-full px-6 py-3 text-sm font-semibold"
                style={{ background: "var(--color-accent)", color: "var(--color-accent-ink)" }}
              >
                Text {phoneNumber}
              </a>
              <p className="mt-3 text-xs" style={{ color: "var(--color-ink-faint)" }}>
                Belle will reply with a link that signs you in and continues onboarding where you
                left off.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                Belle&apos;s number isn&apos;t public yet
              </p>
              <p className="mt-2 text-xs" style={{ color: "var(--color-ink-faint)" }}>
                We&apos;re in early access. Join the waitlist and we&apos;ll text you the moment
                you&apos;re in.
              </p>
            </>
          )}
        </div>

        <p className="mt-8 text-xs leading-relaxed" style={{ color: "var(--color-ink-faint)" }}>
          Passkeys and magic-link email sign-in are planned post-MVP, once Belle supports sign-in
          surfaces that don&apos;t require an active phone conversation.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
