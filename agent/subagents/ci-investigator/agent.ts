import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Investigates failing CI checks: classifies failures (related/flaky/pre-existing/infrastructure), extracts relevant log evidence, recommends next actions. Read-only.",
  model: "anthropic/claude-sonnet-5",
});
