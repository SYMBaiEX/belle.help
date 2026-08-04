import { defineSchedule } from "eve/schedules";

import { db, recordAudit } from "../lib/convex";
import { isPaused, logPaused } from "../lib/paused";

/**
 * Disable watch rules whose temporary window has passed.
 *
 * Previously authored as `expire-temporary-watch-rules.md`. Markdown schedules
 * are fire-and-forget task mode: eve dispatches a full model session on every
 * tick unconditionally, so there is nowhere to put a condition and no way to
 * skip a run. That made this the largest source of idle inference — a model
 * session every 30 minutes, around the clock, almost always to conclude there
 * was nothing to do.
 *
 * Comparing `watchExpiresAt` against the clock does not need a language model.
 * As a handler it is deterministic, auditable, free, and — because it can
 * decline to run — able to honour `BELLE_PAUSED`.
 */
interface ExpiredWatch {
  userId: string;
  fullName: string;
  expiredAt: number;
}

export default defineSchedule({
  cron: "*/30 * * * *",
  async run() {
    if (isPaused()) return logPaused("expire-temporary-watch-rules");

    const expired = (await db.mutation("repositories:expireWatchRules", {})) as ExpiredWatch[];
    if (expired.length === 0) return;

    for (const repo of expired) {
      await recordAudit({
        userId: repo.userId,
        actor: "system",
        action: "watch.expired",
        repositoryFullName: repo.fullName,
        detail: "Temporary watch window elapsed; watching disabled.",
      });
    }

    console.info(`[watch-expiry] disabled ${expired.length} expired watch rule(s)`);
  },
});
