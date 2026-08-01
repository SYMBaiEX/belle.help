export const metadata = { title: "Link expired — Belle" };

export default function LinkExpiredPage() {
  const phoneNumber = process.env.NEXT_PUBLIC_BELLE_PHONE_NUMBER;

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
      style={{ background: "var(--color-bg)" }}
    >
      <div
        className="max-w-sm rounded-2xl border p-8"
        style={{
          background: "var(--color-bg-elevated)",
          borderColor: "var(--color-border)",
          boxShadow: "var(--shadow-soft)",
        }}
      >
        <h1
          className="text-lg font-semibold"
          style={{ color: "var(--color-ink)", fontFamily: "var(--font-display)" }}
        >
          This link has expired
        </h1>
        <p className="mt-3 text-sm" style={{ color: "var(--color-ink-muted)" }}>
          Text Belle and she&apos;ll send a fresh one.
        </p>
        {phoneNumber ? (
          <a
            href={`sms:${phoneNumber}`}
            className="mt-6 inline-block rounded-full px-5 py-2.5 text-sm font-medium"
            style={{ background: "var(--color-accent)", color: "var(--color-accent-ink)" }}
          >
            Text {phoneNumber}
          </a>
        ) : null}
      </div>
    </div>
  );
}
