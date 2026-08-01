import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { requireSessionUser } from "@/lib/auth/session";
import { Card, PageHeading, EmptyState } from "@/components/dashboard/ui";
import { ApprovalInlineActions } from "@/components/dashboard/ApprovalInlineActions";

export const metadata = { title: "Overview — Belle" };

export default async function OverviewPage() {
  const { userId } = await requireSessionUser();

  const [repositories, openPrs, pending, activity] = await Promise.all([
    fetchQuery(api.repositories.listByUser, { userId }),
    fetchQuery(api.pullRequests.listOpenByUser, { userId }),
    fetchQuery(api.approvals.getPending, { userId }),
    fetchQuery(api.auditExtra.listByUserPaginated, { userId, limit: 10 }),
  ]);

  const watchedCount = repositories.filter((r) => r.watchEnabled).length;

  return (
    <div>
      <PageHeading title="Overview" subtitle="What Belle is watching and waiting on." />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-faint)" }}>
            Watched repositories
          </p>
          <p className="mt-2 text-3xl font-semibold" style={{ color: "var(--color-ink)" }}>
            {watchedCount}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-faint)" }}>
            Open pull requests
          </p>
          <p className="mt-2 text-3xl font-semibold" style={{ color: "var(--color-ink)" }}>
            {openPrs.length}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-faint)" }}>
            Pending approvals
          </p>
          <p className="mt-2 text-3xl font-semibold" style={{ color: "var(--color-ink)" }}>
            {pending.length}
          </p>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          Pending approvals
        </h2>
        {pending.length === 0 ? (
          <EmptyState>Nothing waiting on you right now.</EmptyState>
        ) : (
          <div className="space-y-3">
            {pending.map((approval) => (
              <Card key={approval._id} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                    {approval.action} · {approval.repositoryFullName}
                    {approval.prNumber ? ` #${approval.prNumber}` : ""}
                  </p>
                  <p className="mt-1 truncate text-xs" style={{ color: "var(--color-ink-muted)" }}>
                    {approval.prompt}
                  </p>
                </div>
                <ApprovalInlineActions approvalId={approval._id} />
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          Recent activity
        </h2>
        {activity.length === 0 ? (
          <EmptyState>No activity yet.</EmptyState>
        ) : (
          <Card>
            <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {activity.map((event) => (
                <li key={event._id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <span style={{ color: "var(--color-ink)" }}>{event.action}</span>
                  <span style={{ color: "var(--color-ink-faint)" }}>
                    {new Date(event.createdAt).toLocaleString()}
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
