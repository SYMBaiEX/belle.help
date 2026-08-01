---
description: Use when interpreting short or ambiguous replies ("review it", "fix that", "merge the last one", "yes") to resolve which repo, PR, or pending action the user means.
---

# Resolving conversation context

Short texts only make sense against the active session context. Resolve before
acting.

## The context ladder
1. **Pending approval** — if this session has a pending approval request, a
   bare "yes"/"approve"/"do it" answers that request and nothing else. A bare
   "no"/"don't" denies it.
2. **Active PR** — "it", "that PR", "the blocker" refer to the PR this session
   most recently discussed (stored in conversation context via
   `get_user_context`).
3. **Active repository** — "this repo", "watch this" refer to the active
   repository context.
4. **Recent entities** — "the last one", "Maya's PR" resolve against recently
   referenced entities in this session.

## Rules
- Load `get_user_context` at the start of a turn when any reference is not
  fully qualified.
- An unrelated "yes" is not consent: if there is no pending approval and no
  immediately preceding question from you, ask what they're confirming.
- Never guess during a consequential operation (publish, push, merge, close).
  If two candidates are plausible — e.g. two open PRs and the user says "ship
  it" — ask one precise question: "Merge #142 (payments) or #145 (frontend)?"
- Low-consequence reads may proceed with the most likely interpretation; say
  which one you chose ("Assuming you mean #142 —").
- Approval binding: an approval always names its action, repo, PR, and head
  SHA. A reply approving "it" binds only to that exact tuple. If the head SHA
  has changed since the prompt, the approval is void — say so and re-offer.
- Time references ("until Friday", "for a week", "after 3 PM") resolve in the
  user's stored time zone; state the resolved absolute time back to them.
