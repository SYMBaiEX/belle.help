import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc, type AuthFn } from "eve/channels/auth";

import { verifySessionCookie } from "../../lib/auth/session";

/**
 * Web/API channel auth for the embedded Eve routes (dashboard chat, session
 * streaming). Order matters: Vercel OIDC (platform callers) → Belle session
 * cookie (dashboard users) → localhost in dev. Everything else is 401.
 */

function belleSessionAuth(): AuthFn<Request> {
  return async (request) => {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const match = /(?:^|;\s*)belle_session=([^;]+)/.exec(cookieHeader);
    if (!match?.[1]) return null;

    const session = verifySessionCookie(decodeURIComponent(match[1]));
    if (!session) return null;

    return {
      authenticator: "belle-web",
      principalType: "user",
      principalId: session.userId,
      attributes: {
        tenantId: session.userId,
        surface: "dashboard",
      },
    };
  };
}

export default eveChannel({
  auth: [vercelOidc(), belleSessionAuth(), localDev()],
});
