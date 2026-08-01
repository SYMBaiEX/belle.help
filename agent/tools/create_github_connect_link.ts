import { defineTool } from "eve/tools";
import { z } from "zod";

import { createInstallState } from "../../lib/github/state";
import { recordAudit } from "../lib/convex";
import { requireTenantCaller } from "../lib/tenant";

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
    "Create a ready-to-approve GitHub connection link for the current user. Use this whenever the user needs to connect GitHub, asks about their repositories but has none connected, or wants to add more repositories. Send the returned URL to them directly — it opens GitHub's install screen where they pick repositories and approve. The link is personal and expires, so mint a fresh one each time rather than reusing an old one.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const caller = requireTenantCaller(ctx);

    const base = process.env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL;
    if (!base) {
      return {
        available: false as const,
        message:
          "GitHub connection is not configured on this deployment yet. Tell the user their operator still needs to finish GitHub setup — do not invent a link.",
      };
    }

    const ttlMinutes = 30;
    const state = createInstallState(caller.userId, ttlMinutes * 60 * 1000);
    const url = `${base}${base.includes("?") ? "&" : "?"}state=${encodeURIComponent(state)}`;

    await recordAudit({
      userId: caller.userId,
      actor: "belle",
      action: "github.connect_link_created",
      detail: `GitHub install link minted (expires in ${ttlMinutes}m)`,
    });

    return {
      available: true as const,
      url,
      expiresInMinutes: ttlMinutes,
      instructions:
        "Send this URL to the user in its own message so it stays tappable over SMS. Tell them they can choose all repositories or just specific ones, and that repositories appear here right after they approve.",
    };
  },
});
