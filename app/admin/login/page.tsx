"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Invalid email or password.");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5" style={{ background: "var(--color-bg)" }}>
      <div
        className="w-full max-w-sm rounded-2xl border p-6 shadow-soft"
        style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}
      >
        <h1 className="text-xl" style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}>
          Belle admin
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-ink-muted)" }}>
          Sign in to manage access requests and invites.
        </p>

        <form className="mt-6 space-y-3" onSubmit={submit}>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-ink)" }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
