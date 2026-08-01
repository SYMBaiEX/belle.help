import { createMemoryState } from "@chat-adapter/state-memory";
import { createRedisState } from "@chat-adapter/state-redis";
import { createLinqAdapter } from "@linqapp/chat-sdk-adapter";
import type { Message, Thread } from "chat";
import { chatSdkChannel, messageToUserContent } from "eve/channels/chat-sdk";

import { hashPhone, last4 } from "../../lib/encryption";
import { createOnboardingToken } from "../../lib/security/onboarding-links";
import { createShortLink } from "../../lib/short-links";
import { db, recordAudit } from "../lib/convex";

/**
 * Linq → Eve channel.
 *
 * Flow: iMessage/RCS/SMS → Linq → Linq webhook (/eve/v1/linq) → Linq Chat SDK
 * adapter (verifies Standard-Webhooks HMAC signature + timestamp) → this
 * channel → durable Belle session keyed by the Linq chat id.
 *
 * - One Linq conversation ↔ one durable Eve session (`thread` carries the
 *   stable `linq:{chatId}` id, which becomes the continuation token).
 * - Unknown numbers get the onboarding path and never reach the model.
 * - Known users get a session pinned to their tenant via `auth`.
 * - Duplicate webhook deliveries are dropped via Convex `webhookEvents`
 *   (Linq delivery is at-least-once; `message.id` is the dedup key).
 * - Linq opt-out keywords are respected: no reply is sent at all.
 */

const OPT_OUT = new Set(["STOP", "UNSUBSCRIBE", "OPTOUT", "CANCEL", "END", "QUIT"]);

function linqEnv(): { apiKey: string; signingSecret: string; baseURL?: string } {
  return {
    apiKey: process.env.LINQ_API_KEY ?? "linq-api-key-not-configured",
    signingSecret: process.env.LINQ_WEBHOOK_SECRET ?? "whsec_not-configured",
    ...(process.env.LINQ_API_BASE_URL ? { baseURL: process.env.LINQ_API_BASE_URL } : {}),
  };
}

/**
 * Durable Chat SDK state.
 *
 * The in-memory adapter loses thread subscriptions, locks, and the history
 * cache on every cold instance, so state silently reset whenever traffic
 * paused. Redis keeps it shared across invocations.
 *
 * createRedisState() throws when REDIS_URL is unset, and eve evaluates this
 * module at BUILD time — so a missing variable would fail the build rather
 * than the request. Fall back to memory with a loud warning instead: local
 * dev and CI builds should not require a Redis instance.
 */
function chatState() {
  if (process.env.REDIS_URL) return createRedisState();
  console.warn(
    "[linq-channel] REDIS_URL is not set — using in-memory Chat SDK state. " +
      "Thread state will not survive cold starts. Do not run production this way.",
  );
  return createMemoryState();
}

export const { bot, channel, send } = chatSdkChannel({
  userName: "Belle",
  adapters: {
    linq: createLinqAdapter(linqEnv()),
  },
  state: chatState(),
  // Texting surfaces deliver one message per turn; no post-then-edit streaming.
  streaming: false,
});

/**
 * Phone handle (or email) of the sender.
 *
 * The Linq adapter maps `sender_handle.id` -> `author.userId` and
 * `sender_handle.handle` -> `author.userName`, so the PHONE NUMBER lives on
 * `userName`; `userId` is an opaque handle UUID. Prefer whichever field
 * actually looks like an E.164 number or an email so the stored phone hash and
 * last-4 digits are meaningful, and fall back to the stable id otherwise.
 */
function senderHandle(message: Message): string | null {
  const candidates = [message.author?.userName, message.author?.userId];
  const cleaned = candidates
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((v) => v.replace(/^linq:/, ""));

  const identifier = cleaned.find((v) => /^\+?\d{7,15}$/.test(v) || v.includes("@"));
  return identifier ?? cleaned[0] ?? null;
}

async function alreadyProcessed(messageId: string): Promise<boolean> {
  const result = (await db.mutation("webhookEvents:recordIfNew", {
    provider: "linq",
    externalEventId: messageId,
    eventType: "message.received",
    verified: true,
  })) as { duplicate: boolean };
  return result.duplicate;
}

async function handleInbound(thread: Thread, message: Message): Promise<void> {
  const text = (message.text ?? "").trim();

  // Respect opt-outs entirely — no reply, no model dispatch.
  if (OPT_OUT.has(text)) return;

  const handle = senderHandle(message);
  const linqChatId = thread.id; // stable `linq:{chatId}`
  const phoneHash = handle ? hashPhone(handle) : null;

  // Latency: every await here happens before the model starts, and this is a
  // texting surface where seconds are felt. The dedup gate and the identity
  // lookup are independent, and `subscribe()` gates nothing — run them
  // concurrently instead of paying three sequential round-trips.
  const [duplicate, identityResult] = await Promise.all([
    message.id ? alreadyProcessed(message.id) : Promise.resolve(false),
    phoneHash
      ? db.query("phoneIdentities:getByPhoneHash", { phoneHash })
      : db.query("phoneIdentities:getByLinqChatId", { linqChatId }),
    thread.subscribe(),
  ]);

  // At-least-once delivery: drop duplicates before any user-visible effect.
  if (duplicate) return;

  let identity = identityResult as {
    _id: string;
    userId: string | null;
    protocol?: string;
  } | null;

  if (!identity && phoneHash && handle) {
    const id = (await db.mutation("phoneIdentities:create", {
      phoneHash,
      phoneLast4: last4(handle),
      linqChatId,
    })) as string;
    identity = { _id: id, userId: null };
  }

  if (!identity) return; // no resolvable identity (shouldn't happen)

  // ── Invite-only gate ───────────────────────────────────────────────────
  // Belle is invite-only. Every phone identity needs an approved access
  // request before any message reaches the model. Pending users may still
  // complete web onboarding so they are ready the moment they're approved.
  const access = await resolveAccess(identity, linqChatId, handle, text);
  if (access.status !== "approved") {
    await handlePendingAccess(thread, access, linqChatId, identity._id, phoneHash);
    return;
  }

  // ── Approved but not yet onboarded: send the setup link ────────────────
  if (!identity.userId) {
    await sendOnboarding(thread, linqChatId, identity._id, phoneHash, "approved");
    return;
  }

  // ── Known user: dispatch to the durable Belle session ──────────────────
  // Refreshing the conversation pointer is bookkeeping; the model does not
  // read it during this turn, so don't make the user wait on it.
  const contextWrite = db.mutation("conversationContexts:upsert", {
    userId: identity.userId,
    linqChatId,
  });

  const session = await send(messageToUserContent(message), {
    thread,
    auth: {
      authenticator: "linq",
      principalType: "user",
      principalId: identity.userId,
      attributes: {
        tenantId: identity.userId,
        ...(phoneHash ? { phoneHash } : {}),
        linqChatId,
        protocol: identity.protocol ?? "unknown",
      },
    },
  });

  // Surface a failed bookkeeping write instead of an unhandled rejection.
  await contextWrite.catch((error) =>
    console.error("[linq-channel] conversationContexts:upsert failed", error),
  );

  // Record which durable session handled this turn. Without it there is no way
  // to tell a genuinely continuous conversation from one that silently started
  // over — the difference between "Belle forgot" and "Belle was compacted".
  if (session?.id) {
    console.info(`[linq-channel] dispatched to eve session ${session.id}`);
    await db
      .mutation("conversationContexts:upsert", {
        userId: identity.userId,
        linqChatId,
        eveSessionId: session.id,
      })
      .catch((error) => console.error("[linq-channel] session id write failed", error));
  }
}

interface AccessRequest {
  _id: string;
  status: "pending" | "approved" | "denied";
  lastNudgeAt?: number;
  created?: boolean;
}

/** How long to wait before re-reminding a pending user (ms). */
const NUDGE_INTERVAL_MS = 12 * 60 * 60 * 1000;

/**
 * Resolve this phone identity's access state, creating the pending request on
 * the very first inbound message. An approved user record (e.g. someone who
 * redeemed an invite code during onboarding) also grants access.
 */
async function resolveAccess(
  identity: { _id: string; userId: string | null },
  linqChatId: string,
  handle: string | null,
  firstMessageText: string,
): Promise<AccessRequest> {
  if (identity.userId) {
    const approval = (await db.query("users:getApprovalStatus", {
      userId: identity.userId,
    })) as { approvalStatus?: string } | null;
    if (approval?.approvalStatus === "approved") {
      return { _id: "user-approved", status: "approved" };
    }
  }

  const existing = (await db.query("accessRequests:getByPhoneIdentity", {
    phoneIdentityId: identity._id,
  })) as AccessRequest | null;
  if (existing) return existing;

  const created = (await db.mutation("accessRequests:createIfNew", {
    phoneIdentityId: identity._id,
    phoneLast4: handle ? last4(handle) : "----",
    linqChatId,
    firstMessagePreview: firstMessageText.slice(0, 140),
  })) as { requestId: string; status: AccessRequest["status"]; created: boolean };

  await recordAudit({
    actor: "system",
    action: "access.requested",
    detail: `New access request from conversation ${linqChatId}`,
  });

  return { _id: created.requestId, status: created.status, created: created.created };
}

/**
 * Pending/denied users never reach the model. First contact gets the full
 * invite-only explanation plus a setup link (they can complete onboarding
 * while waiting); later messages get a throttled reminder at most twice a day.
 */
async function handlePendingAccess(
  thread: Thread,
  access: AccessRequest,
  linqChatId: string,
  phoneIdentityId: string,
  phoneHash: string | null,
): Promise<void> {
  if (access.status === "denied") return; // stay silent for denied numbers

  const isFirstContact = access.created === true;
  const nudgedRecently =
    typeof access.lastNudgeAt === "number" && Date.now() - access.lastNudgeAt < NUDGE_INTERVAL_MS;
  if (!isFirstContact && nudgedRecently) return;

  const link = await mintOnboardingLink(linqChatId, phoneIdentityId, phoneHash);

  if (isFirstContact) {
    await thread.post(
      "Hey, I'm Belle — your GitHub agent. I watch repositories, review pull requests, " +
        "investigate CI failures, fix approved issues, and help you merge safely.",
    );
    await thread.post(
      "Belle is invite-only right now, so you're on the list and pending approval. " +
        "You can finish setup now so you're ready the moment you're approved — and if " +
        "you have an invite code, enter it there and you're in immediately:",
    );
  } else {
    await thread.post(
      "Still pending approval — I'll text you the moment you're in. " +
        "You can finish setup (or redeem an invite code) meanwhile:",
    );
  }
  await thread.post(link);

  if (access._id !== "user-approved") {
    await db.mutation("accessRequests:markNudged", { requestId: access._id });
  }
}

/**
 * Create a signed, single-use, short-lived onboarding URL, shortened so it
 * reads as a tappable link (and renders a preview card) in Messages rather
 * than a 300-character token blob.
 */
async function mintOnboardingLink(
  linqChatId: string,
  phoneIdentityId: string | null,
  phoneHash: string | null,
): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://belle.help";
  const { token, tokenHash, expiresAt } = createOnboardingToken({
    linqChatId,
    phoneHash: phoneHash ?? "unknown",
  });

  if (phoneIdentityId) {
    await db.mutation("onboarding:createSession", {
      tokenHash,
      phoneIdentityId,
      linqChatId,
      ttlMs: Math.max(0, expiresAt - Date.now()),
    });
  }

  const target = `${appUrl}/onboarding?token=${token}`;
  try {
    return await createShortLink(target, "onboarding", {
      ttlMs: Math.max(0, expiresAt - Date.now()),
    });
  } catch (error) {
    // Never block onboarding on the shortener — fall back to the full URL.
    console.error("[linq-channel] short link failed, sending full URL", error);
    return target;
  }
}

async function sendOnboarding(
  thread: Thread,
  linqChatId: string,
  phoneIdentityId: string | null,
  phoneHash: string | null,
  mode: "new" | "approved" = "new",
): Promise<void> {
  const link = await mintOnboardingLink(linqChatId, phoneIdentityId, phoneHash);

  // Greeting first, link second — Linq rejects links in a chat-creating
  // message, and splitting keeps both readable over SMS.
  if (mode === "approved") {
    await thread.post(
      "You're approved! Finish setting up and I'll get to work — connect GitHub and " +
        "pick the repositories you want me watching:",
    );
  } else {
    await thread.post(
      "Hey, I'm Belle. I can watch your GitHub repositories, review pull requests, " +
        "investigate CI failures, fix approved issues, and help you merge safely.",
    );
    await thread.post("Finish setup here:");
  }
  await thread.post(link);

  await recordAudit({
    actor: "system",
    action: "onboarding.link_sent",
    detail: `Onboarding link sent to conversation ${linqChatId} (${mode})`,
  });
}

bot.onDirectMessage(async (thread: Thread, message: Message) => {
  await handleInbound(thread, message);
});

bot.onSubscribedMessage(async (thread: Thread, message: Message) => {
  // DMs already flow through onDirectMessage; guard against double dispatch
  // (dedup by message id above makes a second call a no-op anyway).
  if (!thread.isDM) await handleInbound(thread, message);
});

export default channel;
