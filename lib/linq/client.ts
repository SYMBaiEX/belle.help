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

export function isLinqConfigured(): boolean {
  return Boolean(process.env.LINQ_API_KEY);
}
