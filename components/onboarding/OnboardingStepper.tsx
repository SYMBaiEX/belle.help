const STEPS = ["Welcome", "AI", "GitHub", "Repos", "Done"] as const;

export function OnboardingStepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((label, i) => (
        <div
          key={label}
          className="h-1.5 flex-1 rounded-full transition-colors"
          style={{
            background: i <= step ? "var(--color-accent)" : "var(--color-border)",
          }}
        />
      ))}
    </div>
  );
}
