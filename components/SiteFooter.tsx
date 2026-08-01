import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t" style={{ borderColor: "var(--color-border)" }}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p style={{ color: "var(--color-ink-faint)" }}>© 2026 Belle</p>
        <div className="flex flex-wrap gap-5" style={{ color: "var(--color-ink-muted)" }}>
          <Link href="/privacy" className="hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="hover:underline">
            Terms
          </Link>
          <Link href="/security" className="hover:underline">
            Security
          </Link>
          <Link href="/signin" className="hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}
