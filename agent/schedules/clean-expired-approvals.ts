import { defineSchedule } from "eve/schedules";

import { isPaused, logPaused } from "../lib/paused";

import { db } from "../lib/convex";

export default defineSchedule({
  cron: "*/15 * * * *",
  async run() {
    if (isPaused()) return logPaused("clean-expired-approvals");

    // No model, no channel — a straight sweep of the approvalRequests table.
    await db.mutation("approvals:expireStale", {});
  },
});
