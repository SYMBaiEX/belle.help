"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Client-side actions for the /dashboard/repositories page: "Connect
 * GitHub" is a plain link to the server-redirecting install route, and
 * "Sync repositories" re-pulls the current installations' repos and
 * refreshes the server-rendered list.
 */
export function RepositoriesActions() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/github/sync", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? "Sync failed. Try again in a moment.");
        return;
      }
      router.refresh();
    } catch {
      setError("Sync failed. Try again in a moment.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <a
          href="/api/github/install"
          className="rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: "var(--color-accent)", color: "var(--color-accent-ink)" }}
        >
          Connect GitHub
        </a>
        <button
          type="button"
          onClick={sync}
          disabled={syncing}
          className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--color-surface)", color: "var(--color-ink-muted)" }}
        >
          {syncing ? "Syncing…" : "Sync repositories"}
        </button>
      </div>
      {error ? (
        <p className="text-xs" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
