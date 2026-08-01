import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { requireSessionUser } from "@/lib/auth/session";
import { Card, Badge, PageHeading, EmptyState } from "@/components/dashboard/ui";
import { RepositoriesActions } from "./RepositoriesActions";

export const metadata = { title: "Repositories — Belle" };

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "That GitHub install link expired or was tampered with. Try connecting again.",
  missing_installation: "GitHub didn't send back an installation. Try connecting again.",
  github_sync_failed: "Connected, but syncing repositories from GitHub failed. Try Sync below.",
};

export default async function RepositoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ synced?: string; error?: string }>;
}) {
  const { userId } = await requireSessionUser();
  const { synced, error } = await searchParams;
  const repositories = await fetchQuery(api.repositories.listByUser, { userId });

  const watched = repositories.filter((r) => r.watchEnabled).length;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title="Repositories"
          subtitle={`${watched} of ${repositories.length} repositories watched.`}
        />
        <RepositoriesActions />
      </div>

      {synced ? (
        <div
          className="mb-4 rounded-xl border px-3.5 py-3 text-sm"
          style={{ borderColor: "var(--color-border)", background: "var(--color-success-soft)", color: "var(--color-success)" }}
        >
          Repositories synced from GitHub.
        </div>
      ) : null}
      {error ? (
        <div
          className="mb-4 rounded-xl border px-3.5 py-3 text-sm"
          style={{ borderColor: "var(--color-border)", background: "var(--color-danger-soft)", color: "var(--color-danger)" }}
        >
          {ERROR_MESSAGES[error] ?? "Something went wrong connecting GitHub."}
        </div>
      ) : null}

      {repositories.length === 0 ? (
        <EmptyState>
          Repos appear here once your GitHub App install completes. Click &quot;Connect
          GitHub&quot; above, or text Belle to finish onboarding, then hit &quot;Sync
          repositories&quot;.
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
