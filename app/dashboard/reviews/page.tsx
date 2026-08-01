import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { requireSessionUser } from "@/lib/auth/session";
import { Card, Badge, PageHeading, EmptyState, statusTone } from "@/components/dashboard/ui";

export const metadata = { title: "Reviews — Belle" };

export default async function ReviewsPage() {
  const { userId } = await requireSessionUser();
  const reviewRuns = await fetchQuery(api.reviewRuns.listByUser, { userId });

  return (
    <div>
      <PageHeading title="Reviews" subtitle="Every review run Belle has performed." />

      {reviewRuns.length === 0 ? (
        <EmptyState>No reviews yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          {reviewRuns.map((run) => (
            <Link key={run._id} href={`/dashboard/reviews/${run._id}`}>
              <Card className="flex items-center justify-between gap-4 transition-colors hover:opacity-90">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                    {run.headSha.slice(0, 10)}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--color-ink-faint)" }}>
                    {run.blockingCount} blocking · {run.importantCount} important ·{" "}
                    {run.suggestionCount} suggestion
                  </p>
                </div>
                <Badge tone={statusTone(run.status)}>{run.status}</Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
