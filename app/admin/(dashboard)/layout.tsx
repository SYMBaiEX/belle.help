import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { requireAdmin } from "@/lib/auth/admin";
import { AdminNav } from "@/components/admin/AdminNav";
import { ForcePasswordChangeModal } from "@/components/admin/ForcePasswordChangeModal";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { email } = await requireAdmin();
  const admin = await fetchQuery(api.adminUsers.getByEmail, { email });

  return (
    <div className="min-h-screen md:flex" style={{ background: "var(--color-bg)" }}>
      <AdminNav />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      {admin?.mustChangePassword ? <ForcePasswordChangeModal /> : null}
    </div>
  );
}
