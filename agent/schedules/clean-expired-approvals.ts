import { defineSchedule } from "eve/schedules";

import { db } from "../lib/convex";

export default defineSchedule({
  cron: "*/15 * * * *",
  async run() {
    // No model, no channel — a straight sweep of the approvalRequests table.
    await db.mutation("approvals:expireStale", {});
  },
});
