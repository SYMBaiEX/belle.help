"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/dashboard/ui";

interface Credential {
  _id: string;
  kind: string;
  last4: string;
}

interface Prefs {
  quietHoursStart?: number;
  quietHoursEnd?: number;
  digestHour?: number;
  mode: "all" | "security_only" | "ci_failures_only";
}

interface PhoneInfo {
  phoneLast4: string;
}

export function SettingsClient({
  aiMode,
  credential,
  prefs,
  phone,
}: {
  aiMode: "byok" | "managed";
  credential: Credential | null;
  prefs: Prefs | null;
  phone: PhoneInfo | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [mode, setMode] = useState<"all" | "security_only" | "ci_failures_only">(
    prefs?.mode ?? "all",
  );
  const [quietStart, setQuietStart] = useState(prefs?.quietHoursStart ?? "");
  const [quietEnd, setQuietEnd] = useState(prefs?.quietHoursEnd ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function saveApiKey() {
    if (!apiKey.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/settings/ai-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      setApiKey("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey() {
    if (!credential) return;
    setBusy(true);
    try {
      await fetch("/api/settings/ai-key/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credentialId: credential._id }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function useManaged() {
    setBusy(true);
    try {
      await fetch("/api/onboarding/ai-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ aiMode: "managed" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveNotifications() {
    setBusy(true);
    try {
      await fetch("/api/settings/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          quietHoursStart: quietStart === "" ? undefined : Number(quietStart),
          quietHoursEnd: quietEnd === "" ? undefined : Number(quietEnd),
        }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (res.ok) {
        window.location.href = "/";
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          AI mode
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
          Currently: {aiMode === "byok" ? "Your OpenAI API key" : "Belle-hosted AI"}
        </p>

        {credential ? (
          <div className="mt-3 flex items-center justify-between rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
            <span className="text-sm" style={{ color: "var(--color-ink)" }}>
              {credential.kind === "openai_api_key" ? "OpenAI" : credential.kind} · sk-…{credential.last4}
            </span>
            <button
              type="button"
              onClick={revokeKey}
              disabled={busy}
              className="rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50"
              style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}
            >
              Revoke
            </button>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-ink)" }}
            />
            <button
              type="button"
              onClick={saveApiKey}
              disabled={busy || !apiKey.trim()}
              className="shrink-0 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
              style={{ background: "var(--color-accent)", color: "var(--color-accent-ink)" }}
            >
              Save key
            </button>
          </div>
        )}

        {aiMode === "byok" && !credential ? null : aiMode === "byok" && credential ? null : (
          <button
            type="button"
            onClick={useManaged}
            disabled={busy}
            className="mt-3 text-xs underline"
            style={{ color: "var(--color-ink-muted)" }}
          >
            Switch to Belle-hosted AI
          </button>
        )}

        <div
          className="mt-4 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-faint)" }}
        >
          ChatGPT/Codex subscription sign-in is not available — OpenAI doesn&apos;t currently
          permit third-party apps to bill inference to a customer&apos;s ChatGPT plan.
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          Notifications
        </p>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
          className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-ink)" }}
        >
          <option value="all">All notifications</option>
          <option value="security_only">Security findings only</option>
          <option value="ci_failures_only">CI failures only</option>
        </select>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="number"
            min={0}
            max={23}
            placeholder="Quiet start"
            value={quietStart}
            onChange={(e) => setQuietStart(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-ink)" }}
          />
          <span style={{ color: "var(--color-ink-faint)" }}>to</span>
          <input
            type="number"
            min={0}
            max={23}
            placeholder="Quiet end"
            value={quietEnd}
            onChange={(e) => setQuietEnd(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-ink)" }}
          />
        </div>
        <button
          type="button"
          onClick={saveNotifications}
          disabled={busy}
          className="mt-3 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
          style={{ background: "var(--color-accent)", color: "var(--color-accent-ink)" }}
        >
          Save
        </button>
      </Card>

      <Card>
        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          Security
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--color-ink-muted)" }}>
          Phone on file ending in {phone ? phone.phoneLast4 : "····"}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--color-ink-faint)" }}>
          Sessions: this dashboard uses a single signed cookie per device, set when you complete
          onboarding. There&apos;s no separate session list yet.
        </p>
      </Card>

      <Card>
        <p className="text-sm font-semibold" style={{ color: "var(--color-danger)" }}>
          Danger zone
        </p>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
          Deleting your account revokes your encrypted credentials, disables watching on all
          repositories, and deletes your stored memories and preferences. It does not uninstall
          the GitHub App (do that on{" "}
          <a href="https://github.com/settings/installations" target="_blank" rel="noreferrer" className="underline">
            GitHub
          </a>{" "}
          directly) and doesn&apos;t delete your message history with Belle on Linq, which follows
          Linq&apos;s own retention policy.
        </p>
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mt-3 rounded-full px-4 py-2 text-xs font-semibold"
            style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}
          >
            Delete my account
          </button>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={deleteAccount}
              disabled={busy}
              className="rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
              style={{ background: "var(--color-danger)", color: "#fff" }}
            >
              {busy ? "Deleting…" : "Confirm delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-full px-4 py-2 text-xs font-semibold"
              style={{ background: "var(--color-surface)", color: "var(--color-ink-muted)" }}
            >
              Cancel
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
