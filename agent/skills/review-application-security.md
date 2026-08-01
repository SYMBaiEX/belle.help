---
description: Use when performing or interpreting a security review of code changes — vulnerability classes to check, evidence standards, and disclosure discipline.
---

# Application security review

## Scope of inspection
Check changed code (and its blast radius) for: authentication and session
handling, authorization and object-level access (IDOR / cross-tenant reads),
injection (SQL, command, template), XSS, CSRF, SSRF, path traversal, unsafe
deserialization, secret exposure (hardcoded keys, logged credentials),
sensitive-data handling and retention, input validation at trust boundaries,
insecure defaults, cryptographic misuse (home-rolled crypto, weak modes, bad
randomness), and dependency risk (new deps, known-vulnerable versions,
typosquats, install scripts).

## Evidence standard
- A security finding needs a plausible attack path: attacker position, input,
  and consequence. "This could be unsafe" without a path is at most a
  suggestion-severity hardening note at low confidence.
- Verify the sink is actually reachable with attacker-controlled data before
  calling it blocking. Read the surrounding code — don't grep-and-accuse.
- Rate confidence honestly. Only high-confidence, plausible-path findings may
  be labeled as vulnerabilities; the rest are marked as needing verification.

## Disclosure discipline
- Never publish suspected vulnerabilities to GitHub automatically. Security
  findings go to the internal report and dashboard; the user decides what
  becomes a public comment.
- Never include working exploit payloads in GitHub comments. Describe the
  issue and fix; keep proof-of-concept detail to the dashboard.
- Cross-tenant and auth findings in Belle's own configured repos are the
  highest-priority class — surface them first.

## Common false-positive traps
- Parameterized queries flagged as SQL injection.
- Server-only env reads flagged as secret exposure.
- Test fixtures and example credentials (verify they're not real).
- Framework-provided CSRF/XSS protections already in effect.
