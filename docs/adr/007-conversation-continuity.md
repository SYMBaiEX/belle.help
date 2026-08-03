# ADR 007: Conversation Continuity — No Token Budget, Automatic Compaction, Watchdog Recovery

- Status: Accepted
- Date: 2026-08-03
- Extends ADR 001 (Eve owns the agent runtime)

## Context

Belle stopped replying for two days. Every inbound message arrived, verified,
returned `200`, and was dispatched to the durable session. Four messages got no
answer and no error was raised anywhere.

The chain:

1. `agent/agent.ts` set `maxInputTokensPerSession: 2_000_000` (eve's default is
   `40_000_000`). A weeks-long texting relationship reached it in a day.
2. On reaching the cap, eve parks the session and texts a continuation prompt
   ("just approve to keep going"), holding every non-matching message until it
   is answered.
3. Worse: **subagents inherit a share of the parent's remaining budget.** With
   the parent exhausted, a `code-fixer` was dispatched with effectively no
   quota. A delegated task cannot reach a human, so it parked on a continuation
   prompt nothing could answer.
4. The parent turn stayed in flight behind that child. Later messages queued
   behind the in-flight turn — correct behaviour for a turn making progress,
   fatal for one that never finishes.

Two properties made this invisible: the webhook path was healthy the whole
time, and eve's own run status read `running`, not `failed`.

## Decision

### 1. No session token budget

`maxInputTokensPerSession: false` (and no output cap).

A token budget is not a cost control on a conversational product — it is a
mid-conversation interruption in which the agent stops to discuss its own
accounting with the user. Belle's promise is that texting her feels like
texting a person, and a person does not do that.

Spend is bounded in `usageEvents` per-user quotas instead. That is the correct
layer: a quota can refuse work *before* it starts, rather than stranding a
half-finished conversation behind a prompt.

Uncapping also closes the delegation failure: an uncapped parent delegates
uncapped children, so a subagent can never be dispatched with zero quota.

`tests/unit/agent-config.test.ts` fails the build if a numeric cap returns. It
reads like a sensible safety limit in review, which is exactly why a comment is
not enough.

### 2. Compaction stays automatic, and compacts sooner

Compaction is a different mechanism from the budget, and it was never the
problem: it is on by default and asks the user nothing. `thresholdPercent` is
lowered to `0.7` (from `0.9`) because Belle's turns are short texts against a
long relationship — riding at 90% of the window means resending a very large
prompt to answer "yeah do it", which costs latency and money without adding
understanding.

Compaction summarizes; it does not preserve everything. Durable facts go
through the `remember` tool into Convex `memories`, which survives any summary.

### 3. A watchdog, because turns can always hang

`agent/schedules/unstick-conversations.ts` runs every 5 minutes. It checks the
**user-visible symptom** rather than internal state: if the newest message in a
chat is from the user and has gone unanswered for more than 10 minutes, that
conversation is broken regardless of which component is at fault. It cancels
the in-flight turn and tells the user it got stuck.

Symptom-based detection is deliberate. The specific bug is fixed; "a turn can
hang" is a permanent property of running work.

Cancellation is safe by contract: eve treats `turn.cancelled` as a user
decision rather than a failure, cancels adopted subagents recursively, keeps
the session and its settled history, and accepts the next message normally.

The watchdog asks the user to resend rather than replaying their message. The
cancelled turn produced nothing they ever saw, and eve retains only settled
history, so resuming would be a guess.

### 4. Session retirement, because some faults outlive a cancel

**eve pins a session's `limits` at creation and never refreshes them.**
`refreshSessionFromTurnAgent` updates the model, tools, and compaction settings
on each turn and spreads the previously persisted `limits` through untouched.
A session created under a bad budget therefore keeps it for life and re-raises
its prompt after every cancel — no redeploy can reach it. This was observed:
the watchdog's cancel drained two days of queued messages, and the session
immediately re-sent the token-limit prompt.

`chatSdkChannel` exposes no `reset()` (unlike custom and Slack channels), but
channel event handlers receive `setContinuationToken`. Re-keying the wedged
session releases the chat's address without deleting anything: the old session
keeps its history under a dead token, and the next inbound message mints a
fresh session on current configuration.

`session.waiting` is the boundary — it fires only after a turn has fully
settled, and unlike `message.completed` it has no built-in handler to displace.

Retirement is requested through Convex (`conversationContexts:requestRetire`),
so an operator can address it by chat id without knowing any eve session id.
The watchdog escalates to it automatically when it has to recover the same
conversation twice within 24 hours: a second stall means the turn was never the
problem.

### 5. Tool output is bounded per result, not per item

Uncapping the budget removes the interruption but not the underlying waste.
Measured on the real session: 2,010,898 input tokens over 13 turns — roughly
155,000 per turn.

The static prompt was never the cause. Measured: instructions ~1.7k tokens,
all 27 authored tool descriptions ~2.2k, skill bodies loaded on demand via
`load_skill` rather than inlined, and the sandbox built-ins (`bash`,
`read_file`, `write_file`, `glob`, `grep`, `web_fetch`, `web_search`, `agent`)
already disabled at the root. Production `/eve/v1/info` confirms 29 advertised
tools. Total static overhead is ~6k tokens.

The cause was **per-item truncation limits multiplying**:

| Tool | Per item | Items | Per call |
|---|---|---|---|
| `list_pull_request_files` | 4,000 chars | 30 | ~30k tokens |
| `get_check_logs` | 1,000 chars | 50 | ~12k tokens |
| `list_repositories` | — | 127 | ~5k tokens |

Each limit is defensible alone. Together they authorize a single turn to pull
60–80k tokens, and because a tool result is appended to the transcript and
re-sent on every later turn, that cost recurs for the rest of the conversation.

`agent/lib/budget.ts` enforces a budget across the whole result. It keeps whole
items rather than shrinking all of them: a few complete diffs are more useful
than thirty fragments, and a fragment of a patch can actively mislead about
what a change does. Results report what was dropped so the model can ask rather
than guess.

`list_repositories` gained `search` / `watchedOnly` and returns counts, so
"am I watching doolittle?" no longer materializes 127 repositories.

Instructions gained a "Pulling only what you need" section, because bounding
tool output only limits the damage — the durable fix is an agent that asks
narrowly, reads summaries before details, does not re-fetch what is already in
the conversation, and delegates deep reading to subagents whose separate
context is the entire reason they exist.

## Consequences

- A single conversation has no framework-level spend ceiling. Per-user quotas
  are now genuinely load-bearing rather than defence-in-depth.
- Retirement loses conversational history for that thread. Acceptable: it only
  fires for a session that is already unusable, and durable facts live in
  `memories`, not in the transcript.
- The watchdog needs `BELLE_INTERNAL_TOKEN` to call our own session-cancel
  route. It logs loudly and disables itself when unset — a silent watchdog is
  worse than none, because it looks like coverage that does not exist.
- Worst case for a hung turn is ~15 minutes of silence (10-minute threshold
  plus the 5-minute sweep) followed by an explanation, instead of indefinite
  silence.

## Report upstream

Two findings worth sending to the eve team, both with clean reproductions:

1. A delegated subagent can be dispatched with zero inherited quota and parks
   on a continuation prompt that nothing can answer, wedging the parent turn
   indefinitely. Failing the child fast (as the docs describe for task-mode
   runs) would surface this instead of hanging.
2. `chatSdkChannel` has no `reset()`, so there is no first-class recovery for a
   parked chat-SDK session. `setContinuationToken` from an event handler works
   but requires a turn to settle first.
