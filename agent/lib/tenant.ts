import type { SessionContext } from "eve/context";

/**
 * Tenant pinning helpers (multi-tenant auth pattern from the Eve docs).
 *
 * The Linq channel stamps `{ authenticator: "linq", principalType: "user",
 * principalId: <convex userId>, attributes: { tenantId, phoneHash, protocol,
 * linqChatId } }` onto every session it starts. GitHub-channel sessions carry
 * the GitHub actor. Tools derive the tenant from verified session auth only —
 * never from model input.
 */

export interface TenantCaller {
  tenantId: string;
  userId: string;
  linqChatId?: string;
  protocol?: string;
}

type AuthLike = {
  auth: {
    current: {
      principalType?: string;
      principalId: string;
      attributes: Record<string, unknown>;
    } | null;
    initiator: {
      principalType?: string;
      principalId: string;
      attributes: Record<string, unknown>;
    } | null;
  };
};

function callerFrom(auth: AuthLike["auth"]["current"]): TenantCaller | null {
  const tenantId = auth?.attributes.tenantId;
  if (auth?.principalType !== "user" || typeof tenantId !== "string") return null;
  return {
    tenantId,
    userId: auth.principalId,
    linqChatId:
      typeof auth.attributes.linqChatId === "string" ? auth.attributes.linqChatId : undefined,
    protocol:
      typeof auth.attributes.protocol === "string" ? auth.attributes.protocol : undefined,
  };
}

/** Strict: throws unless the current caller is an authenticated tenant user. */
export function requireTenantCaller(ctx: Pick<SessionContext, "session">): TenantCaller {
  const caller = callerFrom((ctx.session as unknown as AuthLike).auth.current);
  if (!caller) throw new Error("An authenticated Belle user is required for this action.");
  return caller;
}

/** Lenient: returns null for app/runtime principals (schedules, webhooks). */
export function tenantCallerOrNull(ctx: Pick<SessionContext, "session">): TenantCaller | null {
  return callerFrom((ctx.session as unknown as AuthLike).auth.current);
}

/** True when the current turn was dispatched by the app itself (schedule/webhook). */
export function isAppTurn(ctx: Pick<SessionContext, "session">): boolean {
  const auth = (ctx.session as unknown as AuthLike).auth.current;
  return auth?.principalId === "eve:app";
}
