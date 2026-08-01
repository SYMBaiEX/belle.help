import { NextRequest } from "next/server";
import { z } from "zod";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { getSessionUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/rate-limit";
import { apiError, apiOk } from "@/lib/api/respond";
import { encryptSecret, last4 } from "@/lib/encryption";

const bodySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(20, "That doesn't look like a valid OpenAI API key.")
    .max(200),
});

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return apiError(401, "Not signed in.", "unauthenticated");

  const limited = rateLimit(`ai-key:${session.userId}`, { limit: 5, windowMs: 60_000 });
  if (!limited.allowed) {
    return apiError(429, "Too many attempts. Try again in a moment.", "rate_limited");
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "Invalid API key.", "invalid_body");
  }

  const encrypted = encryptSecret(parsed.data.apiKey);
  const masked = last4(parsed.data.apiKey);

  await fetchMutation(api.encryptedCredentials.create, {
    userId: session.userId,
    kind: "openai_api_key",
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    keyVersion: encrypted.keyVersion,
    last4: masked,
  });

  await fetchMutation(api.userSettings.setAiMode, {
    userId: session.userId,
    aiMode: "byok",
  });

  await fetchMutation(api.audit.record, {
    userId: session.userId,
    actor: "user",
    action: "settings.ai_key_saved",
    detail: `OpenAI API key saved (sk-…${masked}).`,
  });

  // Never return the plaintext or ciphertext — only the masked identifier.
  return apiOk({ kind: "openai_api_key" as const, last4: masked });
}
