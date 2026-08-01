import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { requireSessionUser } from "@/lib/auth/session";
import { PageHeading } from "@/components/dashboard/ui";
import { RepositorySettingsForm } from "@/components/dashboard/RepositorySettingsForm";

export const metadata = { title: "Repository — Belle" };

export default async function RepositoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await requireSessionUser();
  const { id } = await params;

  const repository = await fetchQuery(api.repositoriesExtra.getById, {
    repositoryId: id as Id<"repositories">,
  });

  if (!repository || repository.userId !== userId) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading title={repository.fullName} subtitle="Repository configuration" />
      <RepositorySettingsForm repository={repository} />
    </div>
  );
}
