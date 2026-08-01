"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UserApprovalAction({
  userId,
  approvalStatus,
}: {
  userId: string;
  approvalStatus: "pending" | "approved" | "denied";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(status: "approved" | "denied") {
    setBusy(true);
    try {
      await fetch("/api/admin/users/approval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, approvalStatus: status }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (approvalStatus === "approved") {
    return (
      <button
        type="button"
        onClick={() => setStatus("denied")}
        disabled={busy}
        className="rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50"
        style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}
      >
        {busy ? "Revoking…" : "Revoke access"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setStatus("approved")}
      disabled={busy}
      className="rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50"
      style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}
    >
      {busy ? "Approving…" : "Approve"}
    </button>
  );
}
