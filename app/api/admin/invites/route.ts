import { NextRequest } from "next/server";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { getAdminEmail } from "@/lib/auth/admin";
import { apiError, apiOk } from "@/lib/api/respond";

const bodySchema = z.object({
  note: z.string().max(500).optional(),
  maxUses: z.number().int().min(1).max(10_000).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

// Excludes ambiguous characters (0/O, 1/I/L) so codes are easy to read aloud
// or retype from a text message.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomSegment(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

function generateCode(): string {
  return `BELLE-${randomSegment(4)}-${randomSegment(4)}`;
}

export async function POST(req: NextRequest) {
  const adminEmail = await getAdminEmail();
  if (!adminEmail) return apiError(401, "Not signed in.", "unauthenticated");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, "Invalid invite parameters.", "invalid_body");
  }

  const expiresAt = parsed.data.expiresInDays
    ? Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000
    : undefined;

  // Retry on the (very unlikely) chance of a code collision.
  let inviteCodeId: string | null = null;
  let code = "";
  for (let attempt = 0; attempt < 5 && !inviteCodeId; attempt++) {
    code = generateCode();
    try {
      inviteCodeId = await fetchMutation(api.inviteCodes.create, {
        code,
        createdBy: adminEmail,
        note: parsed.data.note,
        maxUses: parsed.data.maxUses ?? 1,
        expiresAt,
      });
    } catch {
      inviteCodeId = null;
    }
  }

  if (!inviteCodeId) {
    return apiError(500, "Couldn't generate a unique invite code. Try again.", "generation_failed");
  }

  await fetchMutation(api.audit.record, {
    actor: "user",
    action: "admin.invite_code.created",
    detail: `Invite code ${code} created by ${adminEmail}.`,
    refs: { inviteCodeId },
  });

  return apiOk({ code, inviteCodeId });
}
