import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { requireSessionUser } from "@/lib/auth/session";
import { Card, Badge, PageHeading, EmptyState, statusTone } from "@/components/dashboard/ui";

export const metadata = { title: "Pull Requests — Belle" };

export default async function PullRequestsPage() {
  const { userId } = await requireSessionUser();
  const pullRequests = await fetchQuery(api.pullRequests.listOpenByUser, { userId });

  return (
    <div>
      <PageHeading title="Pull Requests" subtitle="Open pull requests across watched repositories." />

      {pullRequests.length === 0 ? (
        <EmptyState>No open pull requests right now.</EmptyState>
      ) : (
        <div className="space-y-3">
          {pullRequests.map((pr) => (
            <Link key={pr._id} href={`/dashboard/pull-requests/${pr._id}`}>
              <Card className="flex items-center justify-between gap-4 transition-colors hover:opacity-90">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                    #{pr.number} {pr.title}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--color-ink-faint)" }}>
                    {pr.authorLogin} · {pr.headSha.slice(0, 7)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={statusTone(pr.state)}>{pr.state}</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
