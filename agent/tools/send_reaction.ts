import { defineTool } from "eve/tools";
import { z } from "zod";
import { react } from "../../lib/linq/client";
import { tenantCallerOrError } from "../lib/tenant";

export default defineTool({
  description:
    "Send a tapback reaction (love/like/dislike/laugh/emphasize/question) on a message. Use sparingly, per the communicate-over-text skill — reactions are best-effort and never throw on failure. Returns { ok: false, message } when the request cannot be satisfied — relay the message rather than retrying blindly.",
  inputSchema: z.object({
    messageId: z.string().min(1),
    type: z.enum(["love", "like", "dislike", "laugh", "emphasize", "question"]),
    operation: z.enum(["add", "remove"]).optional(),
  }),
  async execute({ messageId, type, operation }, ctx) {
    const tenant = tenantCallerOrError(ctx);
    if (!tenant.ok) return tenant;

    try {
      await react(messageId, type, operation ?? "add");
      return { ok: true as const };
    } catch {
      return {
        ok: false as const,
        reason: "reaction_failed",
        message: "I could not add that reaction, but the conversation can continue.",
      };
    }
  },
});
