import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { requireSessionUser } from "@/lib/auth/session";
import { PageHeading } from "@/components/dashboard/ui";
import { SettingsClient } from "@/components/dashboard/SettingsClient";

export const metadata = { title: "Settings — Belle" };

export default async function SettingsPage() {
  const { userId } = await requireSessionUser();

  const [user, credentials, prefs, phone] = await Promise.all([
    fetchQuery(api.userSettings.getSettings, { userId }),
    fetchQuery(api.encryptedCredentials.getByUser, { userId }),
    fetchQuery(api.notificationPreferences.getByUser, { userId }),
    fetchQuery(api.phoneIdentitiesExtra.getByUserId, { userId }),
  ]);

  const credential = credentials[0] ?? null;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading title="Settings" subtitle="AI mode, credentials, notifications, and account." />
      <SettingsClient
        aiMode={user?.aiMode ?? "managed"}
        credential={credential}
        prefs={prefs}
        phone={phone}
      />
    </div>
  );
}
