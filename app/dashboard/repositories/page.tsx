import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { requireSessionUser } from "@/lib/auth/session";
import { Card, Badge, PageHeading, EmptyState } from "@/components/dashboard/ui";

export const metadata = { title: "Repositories — Belle" };

export default async function RepositoriesPage() {
  const { userId } = await requireSessionUser();
  const repositories = await fetchQuery(api.repositories.listByUser, { userId });

  const watched = repositories.filter((r) => r.watchEnabled).length;

  return (
    <div>
      <PageHeading
        title="Repositories"
        subtitle={`${watched} of ${repositories.length} repositories watched.`}
      />

      {repositories.length === 0 ? (
        <EmptyState>
          Repos appear here once your GitHub App install completes. Text Belle or finish
          onboarding to connect one.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {repositories.map((repo) => (
            <Link key={repo._id} href={`/dashboard/repositories/${repo._id}`}>
              <Card className="flex items-center justify-between gap-4 transition-colors hover:opacity-90">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                    {repo.fullName}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--color-ink-faint)" }}>
                    {repo.reviewPolicy.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone="accent">Autonomy {repo.autonomyLevel}</Badge>
                  <Badge tone={repo.watchEnabled ? "success" : "neutral"}>
                    {repo.watchEnabled ? "Watching" : "Paused"}
                  </Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
