import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { requireSessionUser } from "@/lib/auth/session";
import { Card, PageHeading, EmptyState } from "@/components/dashboard/ui";

export const metadata = { title: "Audit Log — Belle" };

export default async function AuditPage() {
  const { userId } = await requireSessionUser();
  const events = await fetchQuery(api.audit.listByUser, { userId });

  return (
    <div>
      <PageHeading title="Audit Log" subtitle="Every action Belle has taken, on the record." />

      {events.length === 0 ? (
        <EmptyState>No audit events yet.</EmptyState>
      ) : (
        <Card>
          <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {events.map((event) => (
              <li key={event._id} className="py-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                    {event.action}
                  </span>
                  <span className="text-xs" style={{ color: "var(--color-ink-faint)" }}>
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
                {event.repositoryFullName ? (
                  <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                    {event.repositoryFullName}
                    {event.prNumber ? ` #${event.prNumber}` : ""}
                  </p>
                ) : null}
                {event.detail ? (
                  <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                    {event.detail}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
