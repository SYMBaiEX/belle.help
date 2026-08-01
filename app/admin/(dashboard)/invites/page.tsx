import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { PageHeading } from "@/components/dashboard/ui";
import { InviteCodesPanel } from "@/components/admin/InviteCodesPanel";

export const metadata = { title: "Invite Codes — Belle admin" };

export default async function AdminInvitesPage() {
  const codes = await fetchQuery(api.inviteCodes.list, {});

  return (
    <div>
      <PageHeading title="Invite Codes" subtitle="Generate self-serve codes so people can skip the approval queue." />
      <InviteCodesPanel codes={codes} />
    </div>
  );
}
