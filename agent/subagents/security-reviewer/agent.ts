import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Reviews security-sensitive changes for auth, injection, secret exposure, cross-tenant access, SSRF/XSS/CSRF, deserialization, path traversal, crypto misuse, and dependency risk. Read-only, evidence-based.",
  model: "anthropic/claude-sonnet-5",
});
