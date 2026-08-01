import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Digest fan-out targets. A user is due a daily digest when their
 * notificationPreferences.digestHour (UTC hour, 0-23) matches the current
 * hour and they have an active Linq conversation. Weekly digests reuse the
 * same hour on Fridays (schedule-side decision).
 */
export const listDigestTargets = query({
  args: { hourUtc: v.number(), kind: v.union(v.literal("daily"), v.literal("weekly")) },
  handler: async (ctx, args) => {
    const prefs = await ctx.db.query("notificationPreferences").collect();
    const due = prefs.filter(
      (p) =>
        (p.digestHour ?? 15) === args.hourUtc &&
        (p.snoozedUntil === undefined || p.snoozedUntil < Date.now()),
    );

    const targets: Array<{ userId: string; linqChatId: string }> = [];
    for (const pref of due) {
      // Any watched repo opted into this digest kind?
      const repos = await ctx.db
        .query("repositories")
        .withIndex("by_userId", (q) => q.eq("userId", pref.userId))
        .collect();
      const wantsDigest = repos.some(
        (r) => r.watchEnabled && (args.kind === "daily" ? r.dailyDigest : r.weeklyDigest),
      );
      if (!wantsDigest) continue;

      const contexts = await ctx.db
        .query("conversationContexts")
        .withIndex("by_userId", (q) => q.eq("userId", pref.userId))
        .collect();
      const newest = contexts.reduce<(typeof contexts)[number] | null>(
        (best, c) => (!best || c.updatedAt > best.updatedAt ? c : best),
        null,
      );
      if (newest?.linqChatId) {
        targets.push({ userId: pref.userId, linqChatId: newest.linqChatId });
      }
    }
    return targets;
  },
});
