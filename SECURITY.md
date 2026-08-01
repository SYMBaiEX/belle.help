# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

Report privately via GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository. Include reproduction steps and impact. We aim to acknowledge
within 72 hours.

## Scope

Belle is a GitHub operator reachable over SMS/iMessage/RCS. The highest-value
targets are:

- **Approval bypass** — anything that lets a merge, push, or PR close happen
  without a valid, unconsumed, head-SHA-bound approval record.
- **Cross-tenant access** — reaching another user's repositories, sessions,
  findings, credentials, or audit records.
- **Credential exposure** — leaking encrypted OpenAI keys, GitHub installation
  tokens, the Linq API key, or `APP_ENCRYPTION_KEY`.
- **Prompt injection with effect** — repository or PR content that causes Belle
  to take an external action or disclose data.
- **Onboarding-link or session-cookie forgery** — impersonating a phone
  identity or an approved user.
- **Sandbox escape** — untrusted repository code reaching the app runtime.

See [docs/security/threat-model.md](docs/security/threat-model.md) for the full
model and current residual risks.

## Running Belle yourself

This repository is open source, but a deployment is only as safe as its
configuration. Before pointing real users at an instance:

- Generate a unique `APP_ENCRYPTION_KEY` (`openssl rand -hex 32`). Never reuse
  the one from any example or another environment.
- Keep `GITHUB_TOKEN` unset in production — GitHub access must come from the
  Vercel Connect managed App, which issues short-lived per-installation tokens.
- Verify the Linq webhook signing secret is set; unsigned inbound events are
  rejected, but a missing secret means no inbound messages at all.
- Work through [docs/production-readiness.md](docs/production-readiness.md),
  including the eval gates (merge-safety, approval-safety, prompt-injection,
  cross-tenant) — a failure there should block your deploy.

## What this repository does not contain

No credentials, API keys, phone numbers, deployment identifiers, or customer
data are committed. All secrets are supplied through environment variables
documented in [.env.example](.env.example).
