/**
 * Direct Linq Partner API V3 client.
 *
 * Used for capabilities the Chat SDK adapter does not expose (reactions with
 * tapback types, typing indicators, protocol pinning, chat health) and for
 * deterministic outbound notifications sent outside a Chat SDK webhook
 * context (GitHub event notifications).
 *
 * Auth: static bearer token. Idempotency: `idempotency_key` inside the
 * `message` object (verified against docs/research/linq-api-notes.md).
 */

const DEFAULT_BASE = "https://api.linqapp.com/api/partner/v3";

export class LinqError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly traceId?: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "LinqError";
  }
}

function baseUrl(): string {
  const configured = process.env.LINQ_API_BASE_URL;
  if (!configured) return DEFAULT_BASE;
  // Accept either the host root or the full /api/partner/v3 base.
  return configured.includes("/api/partner/") ? configured : `${configured.replace(/\/$/, "")}/api/partner/v3`;
}

function apiKey(): string {
  const key = process.env.LINQ_API_KEY;
  if (!key) throw new LinqError("LINQ_API_KEY is not configured", 0);
  return key;
}

async function linqFetch(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey()}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const traceId = res.headers.get("x-trace-id") ?? undefined;
  if (res.status === 204) return { traceId };
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (body.error ?? {}) as Record<string, unknown>;
    throw new LinqError(
      typeof err.message === "string" ? err.message : `Linq API error ${res.status}`,
      res.status,
      typeof err.code === "number" ? err.code : undefined,
      typeof body.trace_id === "string" ? body.trace_id : traceId,
      typeof err.retry_after === "number" ? err.retry_after : undefined,
    );
  }
  if (traceId && body.trace_id === undefined) body.trace_id = traceId;
  return body;
}

/** Strip the Chat SDK adapter's `linq:` thread prefix to get the raw chat id. */
export function rawChatId(linqChatId: string): string {
  return linqChatId.replace(/^linq:/, "");
}

export interface SendTextResult {
  messageId?: string;
  traceId?: string;
}

/** Send a text message to an existing chat, with outbound idempotency. */
export async function sendText(
  linqChatId: string,
  text: string,
  options: { idempotencyKey: string; preferredService?: "iMessage" | "RCS" | "SMS" },
): Promise<SendTextResult> {
  const body = await linqFetch(`/chats/${encodeURIComponent(rawChatId(linqChatId))}/messages`, {
    method: "POST",
    body: JSON.stringify({
      message: {
        parts: [{ type: "text", value: text }],
        idempotency_key: options.idempotencyKey.slice(0, 255),
        ...(options.preferredService ? { preferred_service: options.preferredService } : {}),
      },
    }),
  });
  const msg = (body.id ?? (body as { message?: { id?: string } }).message?.id) as string | undefined;
  return { messageId: msg, traceId: body.trace_id as string | undefined };
}

export type Tapback = "love" | "like" | "dislike" | "laugh" | "emphasize" | "question";

/** Add or remove a tapback reaction on a message. */
export async function react(
  messageId: string,
  type: Tapback,
  operation: "add" | "remove" = "add",
): Promise<void> {
  await linqFetch(`/messages/${encodeURIComponent(messageId)}/reactions`, {
    method: "POST",
    body: JSON.stringify({ operation, type }),
  });
}

/** Start or stop the typing indicator (iMessage 1:1 chats only). */
export async function typing(linqChatId: string, on: boolean): Promise<void> {
  await linqFetch(`/chats/${encodeURIComponent(rawChatId(linqChatId))}/typing`, {
    method: on ? "POST" : "DELETE",
  });
}

/** Fetch chat health — gate outbound sends on OPTED_OUT. */
export async function chatHealth(linqChatId: string): Promise<string | null> {
  try {
    const body = await linqFetch(`/chats/${encodeURIComponent(rawChatId(linqChatId))}`, {
      method: "GET",
    });
    const health = (body as { health_status?: { status?: string } }).health_status?.status;
    return typeof health === "string" ? health : null;
  } catch {
    return null;
  }
}

export interface ChatMessageSummary {
  id: string;
  createdAt: number;
  fromMe: boolean;
  text: string;
}

/**
 * Newest-first messages in a chat.
 *
 * This is the only view of a conversation that reflects what the user actually
 * sees. The watchdog schedule uses it to detect the one failure the agent
 * cannot report about itself: an inbound message that never got an answer
 * because the durable session is wedged on an in-flight turn.
 */
export async function recentMessages(
  linqChatId: string,
  limit = 5,
): Promise<ChatMessageSummary[]> {
  const body = await linqFetch(
    `/chats/${encodeURIComponent(rawChatId(linqChatId))}/messages?limit=${limit}`,
    { method: "GET" },
  );

  const raw = (body as { messages?: unknown; data?: unknown }).messages ?? body.data;
  if (!Array.isArray(raw)) return [];

  const parsed = raw.flatMap((entry): ChatMessageSummary[] => {
    const m = entry as {
      id?: unknown;
      created_at?: unknown;
      is_from_me?: unknown;
      parts?: unknown;
    };
    if (typeof m.id !== "string" || typeof m.created_at !== "string") return [];
    const createdAt = Date.parse(m.created_at);
    if (Number.isNaN(createdAt)) return [];

    const text = Array.isArray(m.parts)
      ? m.parts
          .map((p) => (p as { value?: unknown }).value)
          .filter((v): v is string => typeof v === "string")
          .join(" ")
      : "";

    return [{ id: m.id, createdAt, fromMe: m.is_from_me === true, text }];
  });

  // Do not trust the API's ordering — sort explicitly so "the latest message"
  // means the same thing regardless of how the page came back.
  return parsed.sort((a, b) => b.createdAt - a.createdAt);
}

export function isLinqConfigured(): boolean {
  return Boolean(process.env.LINQ_API_KEY);
}
