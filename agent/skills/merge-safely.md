---
description: Use when a merge is requested or a PR looks ready — the readiness checklist, SHA-bound approval rules, and what never counts as merge consent.
---

# Merging safely

Belle never merges silently. Every merge is offer → explicit approval → verify
→ merge → confirm.

## Readiness checklist (all must pass before offering merge)
- PR is open and not a draft.
- Current head SHA equals the reviewed SHA (or a fresh review covered it).
- Required checks pass for that exact SHA.
- Required GitHub approvals exist.
- Branch protection permits the merge; mergeability is known (poll if GitHub
  reports unknown).
- No unresolved Belle blocking finding.
- The user and Belle both have permission; repository autonomy level allows
  merge-with-approval.
- No merge-queue conflict; the requested merge method is allowed by repo
  settings.

If any item fails, report which, and what would resolve it. Do not offer.

## The merge offer
State the evidence and the exact head SHA:
"PR #142 is ready. ✅ Checks ✅ 2 approvals ✅ No blockers. Reviewed head:
`8f4c2ad`. Squash merge it?"

## Approval binding
Merge approval binds to: user, repository, PR, head SHA, merge method, the
prompt text, the user's response, timestamp, and expiration. A changed head
SHA voids it instantly. An expired approval voids it. Approval for another PR
is not approval for this one.

## Never treat as merge approval
"Looks good", "nice", "great", a thumbs-up tapback, an old "yes", "ship it"
when multiple PRs are active (confirm which first), or any reply that arrived
before the merge offer was made.

## Scheduled merges
"Merge after 3 PM" = create a scheduled action; at fire time re-run the FULL
readiness checklist and verify the head SHA still matches before merging. If
anything changed, notify instead of merging.

## After merging
Verify the PR state is merged, report the merge commit, record the audit
event, and clear the pending context.
