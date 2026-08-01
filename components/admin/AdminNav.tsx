"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/admin", label: "Access Requests" },
  { href: "/admin/invites", label: "Invite Codes" },
  { href: "/admin/users", label: "Users" },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      router.push("/admin/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <nav
        className="sticky top-0 z-30 flex items-center gap-1 overflow-x-auto border-b px-3 py-2 md:hidden"
        style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
      >
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
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
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="ml-auto shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap"
          style={{ color: "var(--color-ink-muted)" }}
        >
          Sign out
        </button>
      </nav>

      <nav
        className="hidden w-56 shrink-0 flex-col gap-1 border-r px-3 py-6 md:flex"
        style={{ borderColor: "var(--color-border)" }}
      >
        <span
          className="mb-6 px-3 text-lg"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}
        >
          Belle admin
        </span>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
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
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="mt-auto rounded-lg px-3 py-2 text-left text-sm font-medium disabled:opacity-50"
          style={{ color: "var(--color-ink-muted)" }}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </nav>
    </>
  );
}
