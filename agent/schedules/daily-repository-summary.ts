import { defineSchedule } from "eve/schedules";

import linq from "../channels/linq";
import { db } from "../lib/convex";

interface DigestTarget {
  userId: string;
  linqChatId: string;
}

/**
 * Hourly tick; fans out daily digests to users whose configured digestHour
 * (UTC) matches the current hour and who have at least one watched repo with
 * dailyDigest enabled. The agent composes the digest and may send nothing
 * when there is nothing notable.
 */
export default defineSchedule({
  cron: "0 * * * *",
  async run({ receive, waitUntil, appAuth }) {
    const hourUtc = new Date().getUTCHours();
    const targets = (await db.query("digests:listDigestTargets", {
      hourUtc,
      kind: "daily",
    })) as DigestTarget[];

    for (const target of targets) {
      waitUntil(
        receive(linq, {
          message:
            "Compose and send the user's daily repository digest: open PRs, CI status, " +
            "pending approvals, and Belle activity in the last 24 hours, bundled into one " +
            "short text. If nothing notable happened, finish without sending anything.",
          target: { adapterName: "linq", threadId: target.linqChatId },
          auth: appAuth,
        }),
      );
    }
  },
});
