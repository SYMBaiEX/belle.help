"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard/overview", label: "Overview" },
  { href: "/dashboard/repositories", label: "Repositories" },
  { href: "/dashboard/pull-requests", label: "Pull Requests" },
  { href: "/dashboard/reviews", label: "Reviews" },
  { href: "/dashboard/fix-runs", label: "Fix Runs" },
  { href: "/dashboard/approvals", label: "Approvals" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/audit", label: "Audit Log" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile: horizontal scrolling tabs */}
      <nav
        className="sticky top-0 z-30 flex gap-1 overflow-x-auto border-b px-3 py-2 md:hidden"
        style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
      >
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap"
              style={{
                background: active ? "var(--color-accent-soft)" : "transparent",
                color: active ? "var(--color-accent)" : "var(--color-ink-muted)",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Desktop: left rail */}
      <nav
        className="hidden w-56 shrink-0 flex-col gap-1 border-r px-3 py-6 md:flex"
        style={{ borderColor: "var(--color-border)" }}
      >
        <Link
          href="/"
          className="mb-6 px-3 text-lg"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}
        >
          Belle
        </Link>
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              style={{
                background: active ? "var(--color-accent-soft)" : "transparent",
                color: active ? "var(--color-accent)" : "var(--color-ink-muted)",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
