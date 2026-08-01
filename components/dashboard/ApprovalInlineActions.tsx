"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ApprovalInlineActions({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approved" | "denied" | null>(null);

  async function resolve(status: "approved" | "denied") {
    setBusy(status);
    try {
      await fetch("/api/approvals/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvalId, status }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        onClick={() => resolve("approved")}
        disabled={busy !== null}
        className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}
      >
        {busy === "approved" ? "Approving…" : "Approve"}
      </button>
      <button
        type="button"
        onClick={() => resolve("denied")}
        disabled={busy !== null}
        className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}
      >
        {busy === "denied" ? "Denying…" : "Deny"}
      </button>
    </div>
  );
}
