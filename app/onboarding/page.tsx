import { getSessionUser } from "@/lib/auth/session";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export const metadata = {
  title: "Finish setting up Belle",
  description:
    "Connect GitHub and choose the repositories Belle should watch.",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; github?: string }>;
}) {
  const { token, github } = await searchParams;
  const session = await getSessionUser();

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <OnboardingFlow
        token={token ?? null}
        signedIn={Boolean(session)}
        githubConnected={github === "connected"}
      />
    </div>
  );
}
