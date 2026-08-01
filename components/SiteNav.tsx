import Link from "next/link";

export function SiteNav() {
  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-md"
      style={{ borderColor: "var(--color-border)", background: "color-mix(in srgb, var(--color-bg) 85%, transparent)" }}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link
          href="/"
          className="text-xl tracking-tight"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}
        >
          Belle
        </Link>
        <div className="hidden items-center gap-7 text-sm md:flex" style={{ color: "var(--color-ink-muted)" }}>
          <Link href="/#how-it-works" className="transition-colors hover:opacity-100" style={{ opacity: 0.9 }}>
            How it works
          </Link>
          <Link href="/security" className="transition-colors hover:opacity-100" style={{ opacity: 0.9 }}>
            Security
          </Link>
          <Link href="/#faq" className="transition-colors hover:opacity-100" style={{ opacity: 0.9 }}>
            FAQ
          </Link>
        </div>
        <Link
          href="/signin"
          className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
          style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}
        >
          Sign in
        </Link>
      </nav>
    </header>
  );
}
