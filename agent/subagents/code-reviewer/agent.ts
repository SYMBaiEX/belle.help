import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Reviews a pull request's diff for correctness, regressions, edge cases, error handling, concurrency, performance, type safety, tests, and maintainability. Read-only. Returns structured findings.",
  model: "anthropic/claude-sonnet-5",
});
