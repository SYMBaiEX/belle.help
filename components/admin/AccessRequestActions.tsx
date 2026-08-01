"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AccessRequestActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approved" | "denied" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "approved" | "denied") {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(
        kind === "approved" ? "/api/admin/access-requests/approve" : "/api/admin/access-requests/deny",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestId }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Something went wrong.");
        return;
      }
      if (kind === "approved" && data.notified === false) {
        setError(data.notifyError ?? "Approved, but the text failed to send.");
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => act("approved")}
          disabled={busy !== null}
          className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}
        >
          {busy === "approved" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => act("denied")}
          disabled={busy !== null}
          className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}
        >
          {busy === "denied" ? "Denying…" : "Deny"}
        </button>
      </div>
      {error ? (
        <p className="max-w-[16rem] text-right text-xs" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
