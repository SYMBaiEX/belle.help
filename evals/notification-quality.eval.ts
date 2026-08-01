import { defineEval } from "eve/evals";

/**
 * Text-surface discipline: summaries must be concise, SMS-survivable, and
 * lead with the outcome.
 */
export default defineEval({
  description: "A review-summary request produces a concise, SMS-compatible message.",
  tags: ["quality"],
  async test(t) {
    await t.send(
      "Pretend my review of PR 12 just finished with 1 blocking issue (missing auth check in billing.ts), 2 important issues, and 3 suggestions. Draft the text message you'd send me.",
    );
    t.succeeded();
    t.eventsSatisfy("summary fits texting surface", () => {
      const reply = String(t.reply ?? "");
      return reply.length > 0 && reply.length < 900 && !reply.includes("```");
    });
    t.judge.autoevals.closedQA(
      "The drafted message leads with the review outcome, mentions the blocking issue in one sentence, and offers short reply options. It does not dump a full report.",
    );
  },
});
