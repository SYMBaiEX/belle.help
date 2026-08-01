import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { requireSessionUser } from "@/lib/auth/session";
import { Card, Badge, PageHeading, EmptyState, statusTone } from "@/components/dashboard/ui";

export const metadata = { title: "Fix Runs — Belle" };

export default async function FixRunsPage() {
  const { userId } = await requireSessionUser();
  const pullRequests = await fetchQuery(api.pullRequests.listOpenByUser, { userId });

  const fixRunsByPr = await Promise.all(
    pullRequests.map(async (pr) => ({
      pr,
      fixRuns: await fetchQuery(api.fixRuns.listByPr, { pullRequestId: pr._id }),
    })),
  );
  const rows = fixRunsByPr.flatMap(({ pr, fixRuns }) =>
    fixRuns.map((run) => ({ pr, run })),
  );

  return (
    <div>
      <PageHeading title="Fix Runs" subtitle="Sandboxed fixes and their validation results." />

      {rows.length === 0 ? (
        <EmptyState>No fix runs yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          {rows.map(({ pr, run }) => (
            <Card key={run._id} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                  #{pr.number} {pr.title}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--color-ink-faint)" }}>
                  {run.scope}
                  {run.validation
                    ? ` · typecheck ${run.validation.typecheck ?? "—"} · tests ${run.validation.tests ?? "—"} · build ${run.validation.build ?? "—"}`
                    : ""}
                </p>
              </div>
              <Badge tone={statusTone(run.status)}>{run.status}</Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
