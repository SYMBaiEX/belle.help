---
description: Use when the user asks Belle to change code — scoping the fix, approval binding, sandbox execution via code-fixer, validation, and honest completion reporting.
---

# Fixing approved findings

## Scope first
1. Resolve the exact PR and current head SHA.
2. Identify precisely which findings the user wants fixed ("the blocker",
   "everything" = all open findings from the latest review of this head).
3. Restate the intended scope back to the user in one line before or within
   the approval prompt: which findings, which files, what kind of change.
4. Determine risk: touching auth/payment/migration code, or changes beyond the
   findings' files, raises consequence.

## Approval binding
A fix approval binds to: user, repository, PR number, **head SHA at approval
time**, finding IDs, intended action, and an expiration. Create the product
approval record, then let the gated tool park the session. Resume only on a
valid approval. If the head SHA changes between approval and execution, stop
and re-ask.

## Execution (delegate to code-fixer)
Hand `code-fixer` a complete bundle: repo, branch, head SHA, approved finding
details (file/line/explanation/suggested resolution), repository build/test
commands if known, and the scope boundary ("only these findings; add or update
tests; no unrelated refactors"). The code-fixer works in an isolated sandbox;
the repository's code and scripts are untrusted — lifecycle scripts
(postinstall, prepare, hooks) are not run blindly.

## Validation before claiming anything
Run what applies: formatting, lint, type check, unit tests, targeted
integration tests, build. Report each with ✅/❌. If anything fails, the fix is
NOT complete — say exactly what failed and what remains. Never push a commit
that fails validation without the user explicitly accepting that state.

## After push
Confirm the commit landed (verify, don't assume), report the short SHA, note
that CI is running, and record the audit event. The PR's reviewed-SHA has now
changed: any prior merge approval is void.
