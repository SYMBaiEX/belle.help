import { defineTool } from "eve/tools";
import { z } from "zod";
import { react } from "../../lib/linq/client";
import { requireTenantCaller } from "../lib/tenant";

export default defineTool({
  description:
    "Send a tapback reaction (love/like/dislike/laugh/emphasize/question) on a message. Use sparingly, per the communicate-over-text skill — reactions are best-effort and never throw on failure.",
  inputSchema: z.object({
    messageId: z.string().min(1),
    type: z.enum(["love", "like", "dislike", "laugh", "emphasize", "question"]),
    operation: z.enum(["add", "remove"]).optional(),
  }),
  async execute({ messageId, type, operation }, ctx) {
    requireTenantCaller(ctx);

    try {
      await react(messageId, type, operation ?? "add");
      return { ok: true as const };
    } catch {
      return { ok: false as const };
    }
  },
});
