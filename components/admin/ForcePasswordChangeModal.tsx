"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Non-dismissable overlay shown when the signed-in admin's record has
 * mustChangePassword: true (either freshly seeded, or reset by another
 * operator). No close button, and the overlay swallows clicks/escape so
 * the rest of /admin stays unusable until a new password is set via
 * POST /api/admin/password. On success, refresh() re-runs the server
 * layout, which will no longer see mustChangePassword and stop rendering
 * this component.
 */
export function ForcePasswordChangeModal() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Couldn't change your password.");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-5"
      style={{ background: "rgba(36, 31, 26, 0.55)" }}
      onKeyDown={(e) => {
        // Block Escape from doing anything — this modal is non-dismissable.
        if (e.key === "Escape") e.preventDefault();
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border p-6 shadow-soft"
        style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}
      >
        <h2 className="text-lg" style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}>
          Set a new password
        </h2>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
          Your account is using a temporary password. Choose a new one (at least 12 characters)
          before continuing.
        </p>

        <form className="mt-5 space-y-3" onSubmit={submit}>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
              Current password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-ink)" }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
              New password
            </label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-ink)" }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
              Confirm new password
            </label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-ink)" }}
            />
          </div>

          {error ? (
            <p className="text-sm" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-2 w-full rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
            style={{ background: "var(--color-accent)", color: "var(--color-accent-ink)" }}
          >
            {busy ? "Saving…" : "Change password"}
          </button>
        </form>
      </div>
    </div>
  );
}
