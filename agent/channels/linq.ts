import { createMemoryState } from "@chat-adapter/state-memory";
import { createLinqAdapter } from "@linqapp/chat-sdk-adapter";
import type { Message, Thread } from "chat";
import { chatSdkChannel, messageToUserContent } from "eve/channels/chat-sdk";

import { hashPhone, last4 } from "../../lib/encryption";
import { createOnboardingToken } from "../../lib/security/onboarding-links";
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

export const { bot, channel, send } = chatSdkChannel({
  userName: "Belle",
  adapters: {
    linq: createLinqAdapter(linqEnv()),
  },
  state: createMemoryState(),
  // Texting surfaces deliver one message per turn; no post-then-edit streaming.
  streaming: false,
});

/** Phone handle of the sender, from the Chat SDK author identity. */
function senderHandle(message: Message): string | null {
  const raw = message.author?.userId ?? message.author?.userName ?? null;
  if (!raw) return null;
  // Linq handles are E.164 phone numbers or emails; strip any adapter prefix.
  const cleaned = raw.replace(/^linq:/, "");
  return cleaned.length > 0 ? cleaned : null;
}

async function alreadyProcessed(messageId: string): Promise<boolean> {
  const result = (await db.mutation("webhookEvents:recordIfNew", {
    provider: "linq",
    externalEventId: messageId,
    eventType: "message.received",
    verified: true,
    receivedAt: Date.now(),
  })) as { duplicate: boolean };
  return result.duplicate;
}

async function handleInbound(thread: Thread, message: Message): Promise<void> {
  const text = (message.text ?? "").trim();

  // Respect opt-outs entirely — no reply, no model dispatch.
  if (OPT_OUT.has(text)) return;

  // At-least-once delivery: drop duplicates before any side effect.
  if (message.id && (await alreadyProcessed(message.id))) return;

  await thread.subscribe();

  const handle = senderHandle(message);
  const linqChatId = thread.id; // stable `linq:{chatId}`

  // Resolve phone identity → Belle user.
  const phoneHash = handle ? hashPhone(handle) : null;
  let identity = (phoneHash
    ? await db.query("phoneIdentities:getByPhoneHash", { phoneHash })
    : await db.query("phoneIdentities:getByLinqChatId", { linqChatId })) as {
    _id: string;
    userId: string | null;
    protocol?: string;
  } | null;

  if (!identity && phoneHash && handle) {
    const id = (await db.mutation("phoneIdentities:create", {
      phoneHash,
      phoneLast4: last4(handle),
      linqChatId,
      createdAt: Date.now(),
    })) as string;
    identity = { _id: id, userId: null };
  }

  // ── Onboarding path: unknown or not-yet-linked number ──────────────────
  if (!identity || !identity.userId) {
    await sendOnboarding(thread, linqChatId, identity?._id ?? null, phoneHash);
    return;
  }

  // ── Known user: dispatch to the durable Belle session ──────────────────
  await db.mutation("conversationContexts:upsert", {
    userId: identity.userId,
    linqChatId,
    updatedAt: Date.now(),
  });

  await send(messageToUserContent(message), {
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
}

async function sendOnboarding(
  thread: Thread,
  linqChatId: string,
  phoneIdentityId: string | null,
  phoneHash: string | null,
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://belle.help";

  // Signed, short-lived, single-use link bound to this conversation + phone.
  const { token, tokenHash, expiresAt } = createOnboardingToken({
    linqChatId,
    phoneHash: phoneHash ?? "unknown",
  });

  if (phoneIdentityId) {
    await db.mutation("onboarding:createSession", {
      tokenHash,
      phoneIdentityId,
      linqChatId,
      createdAt: Date.now(),
      expiresAt,
    });
  }

  // Greeting first, link second — Linq rejects links in a chat-creating
  // message, and splitting keeps both readable over SMS.
  await thread.post(
    "Hey, I'm Belle. I can watch your GitHub repositories, review pull requests, " +
      "investigate CI failures, fix approved issues, and help you merge safely.",
  );
  await thread.post(`Finish setup here:\n${appUrl}/onboarding?token=${token}`);

  await recordAudit({
    actor: "system",
    action: "onboarding.link_sent",
    detail: `Onboarding link sent to conversation ${linqChatId}`,
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
