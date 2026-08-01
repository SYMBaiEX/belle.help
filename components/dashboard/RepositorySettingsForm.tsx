"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/dashboard/ui";

const REVIEW_POLICIES = [
  { value: "internal_only", label: "Internal only — never post to GitHub" },
  { value: "blocking_only", label: "Blocking findings only" },
  { value: "blocking_important", label: "Blocking + important" },
  { value: "high_confidence", label: "High-confidence findings only" },
  { value: "always_ask", label: "Always ask before posting" },
];

const AUTONOMY_LABELS = [
  "0 · Watch only",
  "1 · Review on request",
  "2 · Auto-review",
  "3 · Approved fixes",
  "4 · Full autonomy within guardrails",
];

interface RepoDetail {
  _id: string;
  fullName: string;
  watchEnabled: boolean;
  autonomyLevel: number;
  reviewPolicy: string;
  notifyDrafts: boolean;
  notifyCiFailures: boolean;
  autoReview: boolean;
  securityReview: boolean;
  dailyDigest: boolean;
  weeklyDigest: boolean;
  branchFilters?: string[];
  authorFilters?: string[];
  labelFilters?: string[];
  quietHoursStart?: number;
  quietHoursEnd?: number;
}

function FilterField({
  label,
  values,
  disabled,
  onSave,
}: {
  label: string;
  values?: string[];
  disabled?: boolean;
  onSave: (values: string[] | undefined) => void;
}) {
  const [text, setText] = useState((values ?? []).join(", "));
  return (
    <div>
      <label className="text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
        {label}
      </label>
      <input
        type="text"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const parsed = text
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
          onSave(parsed.length ? parsed : undefined);
        }}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
        style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-ink)" }}
      />
    </div>
  );
}

export function RepositorySettingsForm({ repository }: { repository: RepoDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [repo, setRepo] = useState(repository);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch(`/api/repositories/${repo._id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              Watch this repository
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              When off, Belle won&apos;t react to new events here.
            </p>
          </div>
          <input
            type="checkbox"
            checked={repo.watchEnabled}
            disabled={busy}
            onChange={(e) => {
              setRepo({ ...repo, watchEnabled: e.target.checked });
              patch({ watchEnabled: e.target.checked });
            }}
          />
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          Autonomy level
        </p>
        <select
          value={repo.autonomyLevel}
          disabled={busy}
          onChange={(e) => {
            const level = Number(e.target.value);
            setRepo({ ...repo, autonomyLevel: level });
            patch({ autonomyLevel: level });
          }}
          className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-ink)" }}
        >
          {AUTONOMY_LABELS.map((label, i) => (
            <option key={label} value={i}>
              {label}
            </option>
          ))}
        </select>
      </Card>

      <Card>
        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          Review policy
        </p>
        <select
          value={repo.reviewPolicy}
          disabled={busy}
          onChange={(e) => {
            setRepo({ ...repo, reviewPolicy: e.target.value });
            patch({ reviewPolicy: e.target.value });
          }}
          className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-ink)" }}
        >
          {REVIEW_POLICIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </Card>

      <Card>
        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          Notifications
        </p>
        <div className="mt-3 space-y-2">
          {[
            { key: "notifyDrafts" as const, label: "Notify on draft PRs" },
            { key: "notifyCiFailures" as const, label: "Notify on CI failures" },
            { key: "autoReview" as const, label: "Auto-review new PRs" },
            { key: "securityReview" as const, label: "Security review pass" },
            { key: "dailyDigest" as const, label: "Daily digest" },
            { key: "weeklyDigest" as const, label: "Weekly digest" },
          ].map((toggle) => (
            <label key={toggle.key} className="flex items-center justify-between text-sm" style={{ color: "var(--color-ink-muted)" }}>
              {toggle.label}
              <input
                type="checkbox"
                checked={repo[toggle.key]}
                disabled={busy}
                onChange={(e) => {
                  setRepo({ ...repo, [toggle.key]: e.target.checked });
                  patch({ [toggle.key]: e.target.checked });
                }}
              />
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          Filters
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
          Comma-separated. Leave blank to apply to everything.
        </p>
        <div className="mt-3 space-y-3">
          <FilterField
            label="Branches"
            values={repo.branchFilters}
            disabled={busy}
            onSave={(values) => {
              setRepo({ ...repo, branchFilters: values });
              patch({ branchFilters: values });
            }}
          />
          <FilterField
            label="Authors"
            values={repo.authorFilters}
            disabled={busy}
            onSave={(values) => {
              setRepo({ ...repo, authorFilters: values });
              patch({ authorFilters: values });
            }}
          />
          <FilterField
            label="Labels"
            values={repo.labelFilters}
            disabled={busy}
            onSave={(values) => {
              setRepo({ ...repo, labelFilters: values });
              patch({ labelFilters: values });
            }}
          />
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          Quiet hours (0–23, local time)
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="number"
            min={0}
            max={23}
            placeholder="Start"
            defaultValue={repo.quietHoursStart}
            disabled={busy}
            onBlur={(e) => {
              const v = e.target.value === "" ? undefined : Number(e.target.value);
              patch({ quietHoursStart: v });
            }}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-ink)" }}
          />
          <span style={{ color: "var(--color-ink-faint)" }}>to</span>
          <input
            type="number"
            min={0}
            max={23}
            placeholder="End"
            defaultValue={repo.quietHoursEnd}
            disabled={busy}
            onBlur={(e) => {
              const v = e.target.value === "" ? undefined : Number(e.target.value);
              patch({ quietHoursEnd: v });
            }}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-ink)" }}
          />
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold" style={{ color: "var(--color-danger)" }}>
          Disconnect
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
          Pauses watching immediately. To fully revoke Belle&apos;s access to this repository,
          uninstall the GitHub App from GitHub directly.
        </p>
        <button
          type="button"
          disabled={busy || !repo.watchEnabled}
          onClick={() => {
            setRepo({ ...repo, watchEnabled: false });
            patch({ watchEnabled: false });
          }}
          className="mt-3 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
          style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}
        >
          Disconnect
        </button>
      </Card>
    </div>
  );
}
