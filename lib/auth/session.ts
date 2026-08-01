import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { SESSION_COOKIE_NAME, verifySessionCookie } from "./session-token";

/**
 * Next.js-facing session helpers.
 *
 * The signing/verification primitives live in ./session-token.ts so the Eve
 * agent bundle can import them without pulling in `next/headers`.
 */

export {
  SESSION_COOKIE_NAME,
  createSessionCookie,
  verifySessionCookie,
  sessionCookieOptions,
  type SessionPayload,
} from "./session-token";

/**
 * Read the current session from cookies() in a server component or route
 * handler. Returns null when there is no valid session — callers that
 * require auth should use `requireSessionUser` instead.
 */
export async function getSessionUser(): Promise<{
  userId: Id<"users">;
} | null> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionCookie(value);
  if (!session) return null;
  return { userId: session.userId as Id<"users"> };
}

/**
 * Require a valid session in a server component, redirecting to /signin
 * when absent. Use at the top of dashboard pages/layouts.
 */
export async function requireSessionUser(): Promise<{
  userId: Id<"users">;
}> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/signin");
  }
  return user;
}
