import { query } from "./_generated/server";

/**
 * Read-only joins for the /admin/users page. Belle's users table has no
 * phone or repo-count fields directly, so this stitches phoneIdentities
 * and repositories together for display. Bounded table scans — acceptable
 * at Belle's current invite-only volume.
 */
export const listUsersWithPhone = query({
  args: {},
  handler: async (ctx) => {
    const [users, phoneIdentities, repositories] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("phoneIdentities").collect(),
      ctx.db.query("repositories").collect(),
    ]);

    return users
      .filter((user) => !user.deletedAt)
      .map((user) => {
        const phoneIdentity = phoneIdentities.find((p) => p.userId === user._id);
        const repoCount = repositories.filter((r) => r.userId === user._id).length;
        return {
          userId: user._id,
          name: user.name,
          email: user.email,
          approvalStatus: user.approvalStatus ?? "pending",
          phoneLast4: phoneIdentity?.phoneLast4 ?? null,
          createdAt: user.createdAt,
          repoCount,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});
