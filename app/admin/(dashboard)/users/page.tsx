import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Badge, Card, PageHeading, statusTone } from "@/components/dashboard/ui";
import { UserApprovalAction } from "@/components/admin/UserApprovalAction";

export const metadata = { title: "Users — Belle admin" };

export default async function AdminUsersPage() {
  const users = await fetchQuery(api.adminQueries.listUsersWithPhone, {});

  return (
    <div>
      <PageHeading title="Users" subtitle="Every account, its approval status, and quick access controls." />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide" style={{ color: "var(--color-ink-faint)" }}>
                <th className="pb-2 pr-4">User</th>
                <th className="pb-2 pr-4">Phone</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Repos</th>
                <th className="pb-2 pr-4">Joined</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.userId} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                  <td className="py-2.5 pr-4" style={{ color: "var(--color-ink)" }}>
                    {user.name ?? user.email ?? "Unnamed"}
                  </td>
                  <td className="py-2.5 pr-4" style={{ color: "var(--color-ink-muted)" }}>
                    {user.phoneLast4 ? `···${user.phoneLast4}` : "—"}
                  </td>
                  <td className="py-2.5 pr-4">
                    <Badge tone={statusTone(user.approvalStatus)}>{user.approvalStatus}</Badge>
                  </td>
                  <td className="py-2.5 pr-4" style={{ color: "var(--color-ink-muted)" }}>
                    {user.repoCount}
                  </td>
                  <td className="py-2.5 pr-4" style={{ color: "var(--color-ink-faint)" }}>
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2.5">
                    <div className="flex justify-end">
                      <UserApprovalAction userId={user.userId} approvalStatus={user.approvalStatus} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 ? (
            <p className="mt-4 text-center text-sm" style={{ color: "var(--color-ink-faint)" }}>
              No users yet.
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
