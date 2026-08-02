import { defineTool } from "eve/tools";
import { z } from "zod";

import { createInstallState } from "../../lib/github/state";
import { createShortLink } from "../../lib/short-links";
import { recordAudit } from "../lib/convex";
import { tenantCallerOrError } from "../lib/tenant";

/**
 * Mints a one-tap GitHub App install link for the current user.
 *
 * The link points straight at GitHub's install/approve screen and carries a
 * short-lived signed `state` bound to this Belle user, so the post-install
 * redirect to /api/github/callback can attribute the installation without the
 * user needing an active web session on their phone.
 *
 * Text this link whenever the user has no connected repositories — do not send
 * them to the dashboard to hunt for a button.
 */
export default defineTool({
  description:
    "Create a ready-to-approve GitHub connection link for the current user. Use this whenever the user needs to connect GitHub, asks about their repositories but has none connected, or wants to add more repositories. Send the returned URL to them directly — it opens GitHub's install screen where they pick repositories and approve. The link is personal and expires, so mint a fresh one each time rather than reusing an old one. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const tenant = tenantCallerOrError(ctx);
    if (!tenant.ok) return tenant;
    const { caller } = tenant;

    const base = process.env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL;
    if (!base) {
      return {
        ok: false as const,
        reason: "github_connect_unavailable",
        message:
          "GitHub connection is not configured on this deployment yet, so an operator needs to finish GitHub setup.",
      };
    }

    const ttlMinutes = 30;
    const ttlMs = ttlMinutes * 60 * 1000;
    const state = createInstallState(caller.userId, ttlMs);
    const target = `${base}${base.includes("?") ? "&" : "?"}state=${encodeURIComponent(state)}`;

    // Shorten so it reads as a tappable link in Messages instead of a long
    // query string. Never block on the shortener.
    let url = target;
    try {
      url = await createShortLink(target, "github_connect", { userId: caller.userId, ttlMs });
    } catch (error) {
      console.error("[create_github_connect_link] short link failed", error);
    }

    await recordAudit({
      userId: caller.userId,
      actor: "belle",
      action: "github.connect_link_created",
      detail: `GitHub install link minted (expires in ${ttlMinutes}m)`,
    });

    return {
      ok: true as const,
      available: true as const,
      url,
      expiresInMinutes: ttlMinutes,
      instructions:
        "Send this URL to the user in its own message so it stays tappable over SMS. Tell them they can choose all repositories or just specific ones, and that repositories appear here right after they approve.",
    };
  },
});
