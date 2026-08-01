import { defineTool } from "eve/tools";
import { z } from "zod";
import { db, recordAudit } from "../lib/convex";
import { requireTenantCaller } from "../lib/tenant";

export default defineTool({
  description:
    "Pause Belle's watch on a repository (or all of the user's repositories if none given). When `until` is given, sets a snooze timestamp on notification preferences instead of disabling the watch outright.",
  inputSchema: z.object({
    repositoryFullName: z.string().optional().describe("owner/repo; omit to pause all watched repos"),
    until: z.number().optional().describe("Unix ms timestamp to snooze until"),
  }),
  async execute({ repositoryFullName, until }, ctx) {
    const caller = requireTenantCaller(ctx);

    if (until !== undefined) {
      const existing = (await db.query("notificationPreferences:getByUser", {
        userId: caller.userId,
      })) as {
        quietHoursStart?: number;
        quietHoursEnd?: number;
        timeZone?: string;
        digestHour?: number;
        bundlingWindowSec?: number;
        mode: "all" | "security_only" | "ci_failures_only";
      } | null;

      await db.mutation("notificationPreferences:upsert", {
        userId: caller.userId,
        quietHoursStart: existing?.quietHoursStart,
        quietHoursEnd: existing?.quietHoursEnd,
        timeZone: existing?.timeZone,
        digestHour: existing?.digestHour,
        bundlingWindowSec: existing?.bundlingWindowSec,
        snoozedUntil: until,
        mode: existing?.mode ?? "all",
      });

      await recordAudit({
        userId: caller.userId,
        actor: "belle",
        action: "pause_watch_rule",
        repositoryFullName,
        detail: `snoozed until ${new Date(until).toISOString()}`,
      });

      return { paused: "snoozed" as const, until, repositoryFullName };
    }

    if (repositoryFullName) {
      const repo = (await db.query("repositories:getByUserAndFullName", {
        userId: caller.userId,
        fullName: repositoryFullName,
      })) as { _id: string } | null;
      if (!repo) {
        throw new Error(`Repository ${repositoryFullName} is not configured for this user.`);
      }
      await db.mutation("repositories:setWatch", { repositoryId: repo._id, watchEnabled: false });

      await recordAudit({
        userId: caller.userId,
        actor: "belle",
        action: "pause_watch_rule",
        repositoryFullName,
        detail: "watchEnabled=false",
      });

      return { paused: "single" as const, repositoryFullName };
    }

    const repos = (await db.query("repositories:listByUser", {
      userId: caller.userId,
    })) as Array<{ _id: string; fullName: string; watchEnabled: boolean }>;

    const paused: string[] = [];
    for (const repo of repos) {
      if (!repo.watchEnabled) continue;
      await db.mutation("repositories:setWatch", { repositoryId: repo._id, watchEnabled: false });
      paused.push(repo.fullName);
    }

    await recordAudit({
      userId: caller.userId,
      actor: "belle",
      action: "pause_watch_rule",
      detail: `paused all: ${paused.join(", ") || "(none were watched)"}`,
    });

    return { paused: "all" as const, repositoryFullNames: paused };
  },
});
