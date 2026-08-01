import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const upsert = mutation({
  args: {
    userId: v.id("users"),
    installationId: v.number(),
    accountLogin: v.string(),
    accountType: v.union(v.literal("User"), v.literal("Organization")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubInstallations")
      .withIndex("by_installationId", (q) =>
        q.eq("installationId", args.installationId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: args.userId,
        accountLogin: args.accountLogin,
        accountType: args.accountType,
        status: "active",
        revokedAt: undefined,
      });
      return existing._id;
    }

    return await ctx.db.insert("githubInstallations", {
      userId: args.userId,
      installationId: args.installationId,
      accountLogin: args.accountLogin,
      accountType: args.accountType,
      status: "active",
      createdAt: Date.now(),
    });
  },
});

export const getByInstallationId = query({
  args: { installationId: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("githubInstallations")
      .withIndex("by_installationId", (q) =>
        q.eq("installationId", args.installationId),
      )
      .unique();
  },
});

export const listByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("githubInstallations")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const markRevoked = mutation({
  args: { installationId: v.number() },
  handler: async (ctx, args) => {
    const installation = await ctx.db
      .query("githubInstallations")
      .withIndex("by_installationId", (q) =>
        q.eq("installationId", args.installationId),
      )
      .unique();

    if (!installation) {
      return { ok: false as const, reason: "not found" };
    }

    await ctx.db.patch(installation._id, {
      status: "revoked",
      revokedAt: Date.now(),
    });

    const repos = await ctx.db
      .query("repositories")
      .withIndex("by_userId", (q) => q.eq("userId", installation.userId))
      .collect();

    for (const repo of repos) {
      if (repo.installationId === args.installationId && repo.watchEnabled) {
        await ctx.db.patch(repo._id, { watchEnabled: false });
      }
    }

    return { ok: true as const };
  },
});
