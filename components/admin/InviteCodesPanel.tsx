"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Card, statusTone } from "@/components/dashboard/ui";

interface InviteCodeRow {
  _id: string;
  code: string;
  note?: string;
  maxUses: number;
  usedCount: number;
  expiresAt?: number;
  createdAt: number;
  status: "active" | "exhausted" | "revoked" | "expired";
}

export function InviteCodesPanel({ codes }: { codes: InviteCodeRow[] }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setJustCreated(null);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          note: note.trim() || undefined,
          maxUses,
          expiresInDays: expiresInDays === "" ? undefined : expiresInDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Couldn't generate a code.");
        return;
      }
      setJustCreated(data.code);
      setNote("");
      setMaxUses(1);
      setExpiresInDays("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function copy(id: string, code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch {
      // Clipboard API unavailable — silently ignore, the code is still visible.
    }
  }

  async function revoke(id: string) {
    setRevokingId(id);
    try {
      await fetch("/api/admin/invites/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteCodeId: id }),
      });
      router.refresh();
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div>
      <Card>
        <form className="grid gap-3 sm:grid-cols-4" onSubmit={generate}>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
              Note (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. beta tester batch 1"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-ink)" }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
              Max uses
            </label>
            <input
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value) || 1)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-ink)" }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
              Expires in (days)
            </label>
            <input
              type="number"
              min={1}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Never"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-ink)" }}
            />
          </div>
          <div className="sm:col-span-4">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--color-accent)", color: "var(--color-accent-ink)" }}
            >
              {busy ? "Generating…" : "Generate code"}
            </button>
          </div>
        </form>

        {error ? (
          <p className="mt-3 text-sm" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        ) : null}
        {justCreated ? (
          <p className="mt-3 text-sm" style={{ color: "var(--color-success)" }}>
            Created <span className="font-mono">{justCreated}</span>
          </p>
        ) : null}
      </Card>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide" style={{ color: "var(--color-ink-faint)" }}>
              <th className="pb-2 pr-4">Code</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Uses</th>
              <th className="pb-2 pr-4">Note</th>
              <th className="pb-2 pr-4">Expires</th>
              <th className="pb-2 pr-4">Created</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => (
              <tr key={code._id} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                <td className="py-2.5 pr-4 font-mono text-xs" style={{ color: "var(--color-ink)" }}>
                  {code.code}
                </td>
                <td className="py-2.5 pr-4">
                  <Badge tone={statusTone(code.status)}>{code.status}</Badge>
                </td>
                <td className="py-2.5 pr-4" style={{ color: "var(--color-ink-muted)" }}>
                  {code.usedCount} / {code.maxUses}
                </td>
                <td className="py-2.5 pr-4 max-w-[12rem] truncate" style={{ color: "var(--color-ink-muted)" }}>
                  {code.note ?? "—"}
                </td>
                <td className="py-2.5 pr-4" style={{ color: "var(--color-ink-muted)" }}>
                  {code.expiresAt ? new Date(code.expiresAt).toLocaleDateString() : "Never"}
                </td>
                <td className="py-2.5 pr-4" style={{ color: "var(--color-ink-faint)" }}>
                  {new Date(code.createdAt).toLocaleDateString()}
                </td>
                <td className="py-2.5">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => copy(code._id, code.code)}
                      className="rounded-full px-3 py-1 text-xs font-medium"
                      style={{ background: "var(--color-surface)", color: "var(--color-ink-muted)" }}
                    >
                      {copiedId === code._id ? "Copied" : "Copy"}
                    </button>
                    {code.status === "active" ? (
                      <button
                        type="button"
                        onClick={() => revoke(code._id)}
                        disabled={revokingId === code._id}
                        className="rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50"
                        style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}
                      >
                        {revokingId === code._id ? "Revoking…" : "Revoke"}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {codes.length === 0 ? (
          <p className="mt-4 text-center text-sm" style={{ color: "var(--color-ink-faint)" }}>
            No invite codes yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}
