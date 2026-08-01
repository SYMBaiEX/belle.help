import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { requireSessionUser } from "@/lib/auth/session";
import { Card, Badge, PageHeading, EmptyState, statusTone } from "@/components/dashboard/ui";
import { ApprovalInlineActions } from "@/components/dashboard/ApprovalInlineActions";

export const metadata = { title: "Approvals — Belle" };

export default async function ApprovalsPage() {
  const { userId } = await requireSessionUser();
  const [pending, history] = await Promise.all([
    fetchQuery(api.approvals.getPending, { userId }),
    fetchQuery(api.approvalsExtra.listByUser, { userId }),
  ]);
  const resolved = history.filter((a) => a.status !== "pending");

  return (
    <div>
      <PageHeading
        title="Approvals"
        subtitle="The text conversation with Belle is the primary approval surface — approving here resolves the same record."
      />

      <div className="mb-8">
        <h2 className="mb-3 text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          Pending
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
                  <p className="mt-1 text-xs" style={{ color: "var(--color-ink-faint)" }}>
                    Expires {new Date(approval.expiresAt).toLocaleString()}
                  </p>
                </div>
                <ApprovalInlineActions approvalId={approval._id} />
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          History
        </h2>
        {resolved.length === 0 ? (
          <EmptyState>No resolved approvals yet.</EmptyState>
        ) : (
          <div className="space-y-2">
            {resolved.map((approval) => (
              <Card key={approval._id} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm" style={{ color: "var(--color-ink)" }}>
                    {approval.action} · {approval.repositoryFullName}
                    {approval.prNumber ? ` #${approval.prNumber}` : ""}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--color-ink-faint)" }}>
                    {approval.resolvedAt ? new Date(approval.resolvedAt).toLocaleString() : ""}
                  </p>
                </div>
                <Badge tone={statusTone(approval.status)}>{approval.status}</Badge>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
