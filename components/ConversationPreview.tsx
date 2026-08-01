interface Bubble {
  from: "user" | "belle";
  kind?: "text" | "card";
  text?: string;
  timestamp?: string;
  card?: {
    eyebrow: string;
    title: string;
    meta: string;
    footer?: string;
  };
}

const bubbles: Bubble[] = [
  { from: "user", text: "New PR just came in?", timestamp: "9:41 AM" },
  {
    from: "belle",
    kind: "card",
    card: {
      eyebrow: "New pull request",
      title: "#142 Add subscription cancellation",
      meta: "Maya · 12 files · +384 / −91",
      footer: "Want me to review it?",
    },
  },
  { from: "user", text: "Review it" },
  {
    from: "belle",
    kind: "card",
    card: {
      eyebrow: "🔴 1 blocking finding",
      title: "Cancellation endpoint doesn't verify ownership",
      meta: "The cancellation endpoint doesn't verify the subscription belongs to the customer.",
    },
  },
  { from: "user", text: "Fix the blocker" },
  {
    from: "belle",
    kind: "card",
    card: {
      eyebrow: "✅ Checks passed",
      title: "Fix pushed",
      meta: "8f4c2ad · typecheck, tests, build all green",
    },
  },
  { from: "user", text: "Squash merge it" },
  {
    from: "belle",
    text: "Merged #142 into main as a squash commit. Nice work today.",
  },
];

export function ConversationPreview() {
  return (
    <div
      className="w-full max-w-sm overflow-hidden rounded-[2rem] border shadow-soft"
      style={{ background: "var(--color-bg-elevated)", borderColor: "var(--color-border)" }}
    >
      <div
        className="flex items-center gap-3 border-b px-4 py-3"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold"
          style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
        >
          B
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
            Belle
          </p>
          <p className="text-xs" style={{ color: "var(--color-ink-faint)" }}>
            iMessage
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-3 py-4" style={{ background: "var(--color-bg)" }}>
        {bubbles.map((bubble, i) => (
          <div
            key={i}
            className="animate-bubble-in flex flex-col"
            style={{
              animationDelay: `${i * 260}ms`,
              alignItems: bubble.from === "user" ? "flex-end" : "flex-start",
            }}
          >
            {bubble.kind === "card" && bubble.card ? (
              <div
                className="max-w-[85%] rounded-2xl rounded-tl-sm px-3.5 py-3"
                style={{ background: "var(--color-imessage-gray)" }}
              >
                <p
                  className="text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  {bubble.card.eyebrow}
                </p>
                <p className="mt-0.5 text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                  {bubble.card.title}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                  {bubble.card.meta}
                </p>
                {bubble.card.footer ? (
                  <p className="mt-1.5 text-sm" style={{ color: "var(--color-ink)" }}>
                    {bubble.card.footer}
                  </p>
                ) : null}
              </div>
            ) : (
              <div
                className="max-w-[85%] rounded-2xl px-3.5 py-2 text-sm"
                style={
                  bubble.from === "user"
                    ? {
                        background: "var(--color-imessage-blue)",
                        color: "#fff",
                        borderBottomRightRadius: "0.25rem",
                      }
                    : {
                        background: "var(--color-imessage-gray)",
                        color: "var(--color-ink)",
                        borderBottomLeftRadius: "0.25rem",
                      }
                }
              >
                {bubble.text}
              </div>
            )}
            {bubble.timestamp ? (
              <p className="mt-1 px-1 text-[10px]" style={{ color: "var(--color-ink-faint)" }}>
                {bubble.timestamp}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
