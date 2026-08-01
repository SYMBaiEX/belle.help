import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Implements approved, scoped code fixes in an isolated sandbox: clones the repo, edits only approved files, adds/updates tests, runs validation, commits and pushes without force. Requires pre-approved scope.",
  model: "anthropic/claude-sonnet-5",
});
