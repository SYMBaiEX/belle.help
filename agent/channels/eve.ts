import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc, type AuthFn } from "eve/channels/auth";

// Import the pure-crypto module, not ../../lib/auth/session — the latter
// pulls in `next/headers`, which the Eve agent bundle cannot resolve.
import { verifySessionCookie } from "../../lib/auth/session-token";
import { bearerToken, verifyInternalToken } from "../../lib/security/internal-token";
import { isPaused, logPaused } from "../lib/paused";

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

/**
 * Deployment-internal caller (the unstick-conversations watchdog), which needs
 * to POST a session cancel. Not a user principal: it acts on the app's behalf
 * and carries no tenant, so it can never reach tenant-scoped tools — the tool
 * layer fails closed without a `tenantId`.
 */
function internalServiceAuth(): AuthFn<Request> {
  return async (request) => {
    if (!verifyInternalToken(bearerToken(request.headers.get("authorization")))) return null;
    return {
      authenticator: "belle-internal",
      principalType: "runtime",
      principalId: "belle:watchdog",
      attributes: { surface: "internal" },
    };
  };
}

/**
 * Wrap an authenticator so it denies while Belle is paused.
 *
 * These routes create and resume sessions, so the dashboard chat is a live
 * inference path that the Linq and GitHub channel guards do not cover. The auth
 * layer is the narrowest place to close it — no per-route knowledge needed.
 *
 * The check is inside the returned function, not around the array: eve
 * evaluates channel modules at BUILD time, so a module-scope `isPaused()` would
 * bake the build machine's environment into the deployment. Reading it per
 * request means flipping `BELLE_PAUSED` takes effect on redeploy of config
 * alone, and reads the runtime value.
 */
function whenRunning(inner: AuthFn<Request>): AuthFn<Request> {
  return async (request) => {
    if (isPaused()) {
      logPaused("eve session route");
      return null;
    }
    return inner(request);
  };
}

export default eveChannel({
  auth: [
    whenRunning(vercelOidc()),
    whenRunning(belleSessionAuth()),
    whenRunning(internalServiceAuth()),
    whenRunning(localDev()),
  ],
});
