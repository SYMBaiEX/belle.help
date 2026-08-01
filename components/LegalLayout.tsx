import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-2xl px-5 py-16">
        <h1 className="text-3xl" style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}>
          {title}
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-ink-faint)" }}>
          Last updated {updated}
        </p>
        <div
          className="prose-legal mt-8 space-y-6 text-[15px] leading-relaxed"
          style={{ color: "var(--color-ink-muted)" }}
        >
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
