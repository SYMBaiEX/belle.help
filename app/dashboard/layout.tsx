import { requireSessionUser } from "@/lib/auth/session";
import { DashboardNav } from "@/components/dashboard/DashboardNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSessionUser();

  return (
    <div className="min-h-screen md:flex" style={{ background: "var(--color-bg)" }}>
      <DashboardNav />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
