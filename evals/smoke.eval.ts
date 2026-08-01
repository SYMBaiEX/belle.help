import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "Belle boots, replies, and identifies as a GitHub agent over text.",
  async test(t) {
    await t.send("Hey, who are you and what can you do?");
    t.succeeded();
    t.check(t.reply, includes(/github/i));
    // Text-surface discipline: intro fits in a few SMS segments.
    t.eventsSatisfy("reply is text-message sized", () => String(t.reply ?? "").length < 1200);
  },
});
