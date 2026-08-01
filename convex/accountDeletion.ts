import { v } from "convex/values";
import { mutation } from "./_generated/server";

/**
 * Additive: account deletion for the dashboard "Delete my account" danger
 * zone. This is a soft delete of the Belle-side record (marks users.deletedAt)
 * plus best-effort cleanup of the rows we control directly. It does NOT
 * reach out to GitHub (App uninstall must happen on GitHub's side) or to
 * Linq (conversation history retention follows Linq's own policy) — the
 * settings page must say so.
 */

export const deleteAccount = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return { ok: false as const, reason: "not_found" as const };
    }

    // Revoke encrypted credentials.
    const credentials = await ctx.db
      .query("encryptedCredentials")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const credential of credentials) {
      if (credential.revokedAt === undefined) {
        await ctx.db.patch(credential._id, { revokedAt: Date.now() });
      }
    }

    // Disable watch on all repositories.
    const repositories = await ctx.db
      .query("repositories")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const repo of repositories) {
      if (repo.watchEnabled) {
        await ctx.db.patch(repo._id, { watchEnabled: false });
      }
    }

    // Delete memories across all scopes.
    for (const scope of ["user", "repository", "conversation"] as const) {
      const memories = await ctx.db
        .query("memories")
        .withIndex("by_userId_scope", (q) =>
          q.eq("userId", args.userId).eq("scope", scope),
        )
        .collect();
      for (const memory of memories) {
        await ctx.db.delete(memory._id);
      }
    }

    // Delete conversation contexts.
    const contexts = await ctx.db
      .query("conversationContexts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const context of contexts) {
      await ctx.db.delete(context._id);
    }

    // Delete notification preferences.
    const prefs = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const pref of prefs) {
      await ctx.db.delete(pref._id);
    }

    await ctx.db.patch(args.userId, { deletedAt: Date.now() });

    await ctx.db.insert("auditEvents", {
      userId: args.userId,
      actor: "user",
      action: "account.deleted",
      detail: "User requested account deletion from the dashboard settings page.",
      createdAt: Date.now(),
    });

    return { ok: true as const };
  },
});
