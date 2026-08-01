import { randomUUID } from "node:crypto";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { getSessionUser } from "@/lib/auth/session";
import { apiError, apiOk } from "@/lib/api/respond";
import { isLinqConfigured, sendText } from "@/lib/linq/client";

export async function POST() {
  const session = await getSessionUser();
  if (!session) return apiError(401, "Not signed in.", "unauthenticated");

  const repositories = await fetchQuery(api.repositories.listByUser, {
    userId: session.userId,
  });

  const repoList = repositories.length
    ? repositories.map((r) => r.fullName).join(", ")
    : "no repositories yet";

  const confirmationText =
    `You're connected. I'm watching ${repoList}. ` +
    `You can text: "What changed today?" · "Review PR 142" · "Why is CI failing?" ` +
    `I'll ask before changing code or merging.`;

  let textSent = false;
  if (isLinqConfigured()) {
    const phoneIdentity = await fetchQuery(api.phoneIdentitiesExtra.getByUserId, {
      userId: session.userId,
    });
    if (phoneIdentity?.linqChatId) {
      try {
        await sendText(phoneIdentity.linqChatId, confirmationText, {
          idempotencyKey: `onboarding-complete:${session.userId}:${randomUUID()}`,
        });
        textSent = true;
      } catch {
        // Best-effort — the dashboard confirmation still lands even if the
        // text fails (e.g. Linq outage), so we don't block completion on it.
        textSent = false;
      }
    }
  }

  await fetchMutation(api.audit.record, {
    userId: session.userId,
    actor: "user",
    action: "onboarding.completed",
    detail: textSent
      ? "Onboarding completed; confirmation text sent."
      : "Onboarding completed; confirmation text not sent (Linq not configured or send failed).",
  });

  return apiOk({ confirmationText, textSent });
}
