import { getSessionUser } from "@/lib/auth/session";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export const metadata = { title: "Set up Belle" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const session = await getSessionUser();

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <OnboardingFlow token={token ?? null} signedIn={Boolean(session)} />
    </div>
  );
}
