export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${className}`}
      style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}
    >
      {children}
    </div>
  );
}

const BADGE_TONES: Record<string, { bg: string; fg: string }> = {
  neutral: { bg: "var(--color-surface)", fg: "var(--color-ink-muted)" },
  accent: { bg: "var(--color-accent-soft)", fg: "var(--color-accent)" },
  success: { bg: "var(--color-success-soft)", fg: "var(--color-success)" },
  warning: { bg: "var(--color-warning-soft)", fg: "var(--color-warning)" },
  danger: { bg: "var(--color-danger-soft)", fg: "var(--color-danger)" },
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: keyof typeof BADGE_TONES;
}) {
  const t = BADGE_TONES[tone];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: t.bg, color: t.fg }}
    >
      {children}
    </span>
  );
}

export function severityTone(severity: string): keyof typeof BADGE_TONES {
  if (severity === "blocking") return "danger";
  if (severity === "important") return "warning";
  return "neutral";
}

export function confidenceTone(confidence: string): keyof typeof BADGE_TONES {
  if (confidence === "high") return "success";
  if (confidence === "medium") return "warning";
  return "neutral";
}

export function statusTone(status: string): keyof typeof BADGE_TONES {
  if (["completed", "validated", "pushed", "approved", "merged", "active"].includes(status)) return "success";
  if (["failed", "denied", "expired", "revoked"].includes(status)) return "danger";
  if (["running", "pending"].includes(status)) return "warning";
  return "neutral";
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border border-dashed p-8 text-center text-sm"
      style={{ borderColor: "var(--color-border)", color: "var(--color-ink-faint)" }}
    >
      {children}
    </div>
  );
}

export function PageHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl" style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}>
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-1 text-sm" style={{ color: "var(--color-ink-muted)" }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
