import { defineSchedule } from "eve/schedules";

import { isPaused, logPaused } from "../lib/paused";

import linq from "../channels/linq";
import { db } from "../lib/convex";
import { scheduledUserAuth } from "../lib/schedule-auth";

interface DigestTarget {
  userId: string;
  linqChatId: string;
}

/**
 * Friday hourly tick; fans out weekly digests at the user's configured
 * digestHour (UTC) for repos with weeklyDigest enabled.
 */
export default defineSchedule({
  cron: "0 * * * 5",
  async run({ receive, waitUntil }) {
    if (isPaused()) return logPaused("weekly-repository-summary");

    const hourUtc = new Date().getUTCHours();
    const targets = (await db.query("digests:listDigestTargets", {
      hourUtc,
      kind: "weekly",
    })) as DigestTarget[];

    for (const target of targets) {
      waitUntil(
        receive(linq, {
          message:
            "Compose and send the user's weekly repository summary: merged and open PRs, " +
            "review findings resolved or still blocking, CI trends, and anything needing " +
            "attention next week — one concise text. If the week was quiet, say so briefly.",
          target: { adapterName: "linq", threadId: target.linqChatId },
          auth: scheduledUserAuth(target.userId, target.linqChatId),
        }),
      );
    }
  },
});
