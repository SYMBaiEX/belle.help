import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Card, Badge, PageHeading, EmptyState, statusTone } from "@/components/dashboard/ui";
import { AccessRequestActions } from "@/components/admin/AccessRequestActions";
import { relativeTime } from "@/lib/format/relativeTime";

export const metadata = { title: "Access Requests — Belle admin" };

export default async function AdminAccessRequestsPage() {
  const [counts, pending, approved, denied] = await Promise.all([
    fetchQuery(api.accessRequests.counts, {}),
    fetchQuery(api.accessRequests.listByStatus, { status: "pending", limit: 100 }),
    fetchQuery(api.accessRequests.listByStatus, { status: "approved", limit: 25 }),
    fetchQuery(api.accessRequests.listByStatus, { status: "denied", limit: 25 }),
  ]);

  const resolved = [...approved, ...denied].sort(
    (a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0),
  );

  return (
    <div>
      <PageHeading title="Access Requests" subtitle="Belle is invite-only — approve or deny each new phone number." />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-faint)" }}>
            Pending
          </p>
          <p className="mt-2 text-3xl font-semibold" style={{ color: "var(--color-ink)" }}>
            {counts.pending}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-faint)" }}>
            Approved
          </p>
          <p className="mt-2 text-3xl font-semibold" style={{ color: "var(--color-ink)" }}>
            {counts.approved}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-faint)" }}>
            Denied
          </p>
          <p className="mt-2 text-3xl font-semibold" style={{ color: "var(--color-ink)" }}>
            {counts.denied}
          </p>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          Pending
        </h2>
        {pending.length === 0 ? (
          <EmptyState>No one is waiting right now.</EmptyState>
        ) : (
          <div className="space-y-3">
            {pending.map((request) => (
              <Card key={request._id} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                    ···{request.phoneLast4} · waiting {relativeTime(request.firstMessageAt)}
                  </p>
                  {request.firstMessagePreview ? (
                    <p className="mt-1 truncate text-xs" style={{ color: "var(--color-ink-muted)" }}>
                      &ldquo;{request.firstMessagePreview}&rdquo;
                    </p>
                  ) : null}
                  <p className="mt-1 truncate text-xs" style={{ color: "var(--color-ink-faint)" }}>
                    {request.linqChatId}
                  </p>
                </div>
                <AccessRequestActions requestId={request._id} />
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          Recently resolved
        </h2>
        {resolved.length === 0 ? (
          <EmptyState>Nothing resolved yet.</EmptyState>
        ) : (
          <Card>
            <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {resolved.slice(0, 25).map((request) => (
                <li key={request._id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <span style={{ color: "var(--color-ink)" }}>···{request.phoneLast4}</span>{" "}
                    <Badge tone={statusTone(request.status)}>{request.status}</Badge>
                  </div>
                  <span className="shrink-0 text-xs" style={{ color: "var(--color-ink-faint)" }}>
                    {request.resolvedBy ?? "—"} ·{" "}
                    {request.resolvedAt ? new Date(request.resolvedAt).toLocaleString() : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
