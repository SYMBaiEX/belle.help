import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { requireSessionUser } from "@/lib/auth/session";
import {
  Card,
  Badge,
  PageHeading,
  EmptyState,
  statusTone,
  severityTone,
} from "@/components/dashboard/ui";

export const metadata = { title: "Pull Request — Belle" };

export default async function PullRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await requireSessionUser();
  const { id } = await params;
  const pullRequestId = id as Id<"pullRequests">;

  const pr = await fetchQuery(api.pullRequestsExtra.getById, { pullRequestId });
  if (!pr || pr.userId !== userId) notFound();

  const repository = await fetchQuery(api.repositoriesExtra.getById, {
    repositoryId: pr.repositoryId,
  });
  const repositoryFullName = repository?.fullName ?? "";

  const [latestReview, fixRuns, approvals, auditTrail] = await Promise.all([
    fetchQuery(api.reviewRuns.getLatestForPr, { pullRequestId }),
    fetchQuery(api.fixRuns.listByPr, { pullRequestId }),
    fetchQuery(api.approvalsExtra.listByUser, { userId }),
    fetchQuery(api.auditExtra.listByUserAndPr, {
      userId,
      repositoryFullName,
      prNumber: pr.number,
    }),
  ]);

  const findings = latestReview
    ? await fetchQuery(api.reviewFindings.listByRun, { reviewRunId: latestReview._id })
    : [];

  const relatedApprovals = approvals.filter(
    (a) => a.prNumber === pr.number && a.repositoryFullName === repositoryFullName,
  );
  const blockingOpen = findings.some((f) => f.blocksMerge && !f.dismissedAt);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading title={`#${pr.number} ${pr.title}`} subtitle={`${pr.authorLogin} · ${pr.state}`} />

      <Card className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <Info label="Head SHA" value={pr.headSha.slice(0, 10)} />
          <Info label="Base → Head" value={`${pr.baseRef} ← ${pr.headRef}`} />
          <Info label="Changes" value={`+${pr.additions ?? 0} / −${pr.deletions ?? 0} · ${pr.changedFiles ?? 0} files`} />
          <Info label="Link" value={<a href={pr.url} target="_blank" rel="noreferrer" className="underline">View on GitHub</a>} />
        </div>
        <div
          className="mt-4 rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "var(--color-border)",
            background: blockingOpen ? "var(--color-danger-soft)" : "var(--color-success-soft)",
            color: blockingOpen ? "var(--color-danger)" : "var(--color-success)",
          }}
        >
          {blockingOpen
            ? "Not merge-ready — blocking findings are still open."
            : "No open blocking findings from the latest review."}
        </div>
      </Card>

      <Section title="Latest review">
        {!latestReview ? (
          <EmptyState>No review has run for this PR yet.</EmptyState>
        ) : (
          <Card>
            <div className="flex items-center justify-between">
              <Badge tone={statusTone(latestReview.status)}>{latestReview.status}</Badge>
              <Link href={`/dashboard/reviews/${latestReview._id}`} className="text-xs underline" style={{ color: "var(--color-ink-muted)" }}>
                Full review →
              </Link>
            </div>
            {latestReview.summary ? (
              <p className="mt-3 text-sm" style={{ color: "var(--color-ink-muted)" }}>
                {latestReview.summary}
              </p>
            ) : null}
            <div className="mt-4 space-y-2">
              {findings.slice(0, 5).map((f) => (
                <div key={f._id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate" style={{ color: "var(--color-ink)" }}>
                    {f.title}
                  </span>
                  <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}
      </Section>

      <Section title="Fix runs">
        {fixRuns.length === 0 ? (
          <EmptyState>No fix runs yet.</EmptyState>
        ) : (
          <div className="space-y-2">
            {fixRuns.map((run) => (
              <Card key={run._id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm" style={{ color: "var(--color-ink)" }}>
                    {run.scope}
                  </p>
                  {run.commitSha ? (
                    <p className="text-xs" style={{ color: "var(--color-ink-faint)" }}>
                      {run.commitSha.slice(0, 10)}
                    </p>
                  ) : null}
                </div>
                <Badge tone={statusTone(run.status)}>{run.status}</Badge>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title="Approval history">
        {relatedApprovals.length === 0 ? (
          <EmptyState>No approvals requested for this PR yet.</EmptyState>
        ) : (
          <div className="space-y-2">
            {relatedApprovals.map((a) => (
              <Card key={a._id} className="flex items-center justify-between gap-3">
                <span className="truncate text-sm" style={{ color: "var(--color-ink)" }}>
                  {a.action}
                </span>
                <Badge tone={statusTone(a.status)}>{a.status}</Badge>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title="Audit trail">
        {auditTrail.length === 0 ? (
          <EmptyState>No audit events recorded yet.</EmptyState>
        ) : (
          <Card>
            <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {auditTrail.map((event) => (
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
      </Section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-faint)" }}>
        {label}
      </p>
      <p className="mt-1 text-sm" style={{ color: "var(--color-ink)" }}>
        {value}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-3 text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}
