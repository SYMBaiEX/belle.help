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
  confidenceTone,
} from "@/components/dashboard/ui";

export const metadata = { title: "Review — Belle" };

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await requireSessionUser();
  const { id } = await params;
  const reviewRunId = id as Id<"reviewRuns">;

  const run = await fetchQuery(api.reviewRunsExtra.getById, { reviewRunId });
  if (!run || run.userId !== userId) notFound();

  const findings = await fetchQuery(api.reviewFindings.listByRun, { reviewRunId });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading title={`Review · ${run.headSha.slice(0, 10)}`} subtitle={run.summary} />

      <Card className="mb-6 flex items-center gap-3">
        <Badge tone={statusTone(run.status)}>{run.status}</Badge>
        <Badge tone="danger">{run.blockingCount} blocking</Badge>
        <Badge tone="warning">{run.importantCount} important</Badge>
        <Badge tone="neutral">{run.suggestionCount} suggestion</Badge>
      </Card>

      {findings.length === 0 ? (
        <EmptyState>No findings on this review.</EmptyState>
      ) : (
        <div className="space-y-4">
          {findings.map((f) => (
            <Card key={f._id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium" style={{ color: "var(--color-ink)" }}>
                  {f.title}
                </p>
                <div className="flex gap-2">
                  {f.blocksMerge ? <Badge tone="danger">Blocks merge</Badge> : null}
                  <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
                  <Badge tone={confidenceTone(f.confidence)}>{f.confidence} confidence</Badge>
                </div>
              </div>
              <p className="mt-2 text-xs" style={{ color: "var(--color-ink-faint)" }}>
                {f.file}
                {f.startLine ? `:${f.startLine}${f.endLine ? `–${f.endLine}` : ""}` : ""}
              </p>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
                {f.explanation}
              </p>
              {f.impact ? (
                <p className="mt-2 text-sm" style={{ color: "var(--color-ink)" }}>
                  <strong>Impact: </strong>
                  {f.impact}
                </p>
              ) : null}
              {f.evidence ? (
                <pre
                  className="mt-2 overflow-x-auto rounded-lg border p-3 text-xs"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
                >
                  {f.evidence}
                </pre>
              ) : null}
              {f.suggestedResolution ? (
                <p className="mt-2 text-sm" style={{ color: "var(--color-ink)" }}>
                  <strong>Suggested fix: </strong>
                  {f.suggestedResolution}
                </p>
              ) : null}
              {f.dismissedAt ? (
                <p className="mt-2 text-xs" style={{ color: "var(--color-ink-faint)" }}>
                  Dismissed {new Date(f.dismissedAt).toLocaleString()}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
