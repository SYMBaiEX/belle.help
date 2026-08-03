import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "../lib/convex";
import { tenantCallerOrError } from "../lib/tenant";

/**
 * Most repositories a single call will return.
 *
 * This user has 127 connected repositories, and the unbounded version put all
 * of them into the transcript — where they stayed for every later turn. Nobody
 * texting asks to be read a list of 127 names; they ask "am I watching
 * doolittle?" or "what are you watching?". Answer that, and let the model
 * narrow with `search` when it needs something specific.
 */
const PAGE_LIMIT = 25;

interface Repo {
  fullName: string;
  owner: string;
  name: string;
  defaultBranch?: string;
  autonomyLevel: number;
  watchEnabled: boolean;
  watchExpiresAt?: number;
  reviewPolicy: string;
}

export default defineTool({
  description:
    "List repositories configured for this Belle user. Returns watched repositories first, then the rest, capped per call with a total count — so use `search` to find a specific repository by name instead of paging through everything. Set watchedOnly when the user asks what you are watching. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
  inputSchema: z.object({
    search: z
      .string()
      .optional()
      .describe("Case-insensitive substring match on owner/name. Use this before paging."),
    watchedOnly: z.boolean().optional().describe("Only repositories with watching enabled."),
  }),
  async execute({ search, watchedOnly }, ctx) {
    const tenant = tenantCallerOrError(ctx);
    if (!tenant.ok) return tenant;
    const { caller } = tenant;

    const all = (await db.query("repositories:listByUser", {
      userId: caller.userId,
    })) as Repo[];

    const needle = search?.trim().toLowerCase();
    const matched = all.filter((r) => {
      if (watchedOnly && !r.watchEnabled) return false;
      if (needle && !r.fullName.toLowerCase().includes(needle)) return false;
      return true;
    });

    // Watched repositories are the ones the user is actually working with, so
    // they should never be the ones cut off by the cap.
    const ordered = [...matched].sort((a, b) => {
      if (a.watchEnabled !== b.watchEnabled) return a.watchEnabled ? -1 : 1;
      return a.fullName.localeCompare(b.fullName);
    });

    const page = ordered.slice(0, PAGE_LIMIT);

    return {
      ok: true as const,
      totalConfigured: all.length,
      totalMatching: matched.length,
      returned: page.length,
      omitted: matched.length - page.length,
      watchedCount: all.filter((r) => r.watchEnabled).length,
      repositories: page.map((r) => ({
        fullName: r.fullName,
        defaultBranch: r.defaultBranch,
        autonomyLevel: r.autonomyLevel,
        watchEnabled: r.watchEnabled,
        watchExpiresAt: r.watchExpiresAt,
        reviewPolicy: r.reviewPolicy,
      })),
    };
  },
});
