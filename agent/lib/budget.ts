/**
 * Output budgets for tool results.
 *
 * Every tool result is appended to the session transcript and re-sent on every
 * later turn, so a tool's output size is not a one-time cost — it is a tax on
 * the whole rest of the conversation. Belle is a texting agent: the model needs
 * enough to answer in two sentences, not a full data dump.
 *
 * The failure this prevents is specifically *per-item* limits, which look
 * careful in isolation and multiply in practice. "Truncate each patch to 4,000
 * characters" reads as a safeguard, but across 30 files it authorizes 120,000
 * characters — roughly 30,000 tokens — from a single call. Real sessions grew
 * to ~150,000-token prompts this way.
 *
 * So budgets here are enforced across the *whole result*: an item may shrink or
 * drop, but the total cannot exceed what the conversation can afford.
 */

/** ~4 chars per token is close enough to reason about a budget in characters. */
export const CHARS_PER_TOKEN = 4;

/**
 * Default ceiling for one tool result: ~6k tokens.
 *
 * Chosen so that even a handful of tool calls in one turn stays well clear of
 * the compaction threshold, leaving room for the conversation itself.
 */
export const DEFAULT_RESULT_BUDGET = 24_000;

/** Truncate a single string, marking it so the model knows it is partial. */
export function capText(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max)}\n…(truncated)`, truncated: true };
}

export interface BudgetedList<T> {
  /** Items that fit, in order. */
  items: T[];
  /** How many items were dropped entirely because the budget ran out. */
  omitted: number;
  /** True when anything was dropped or shortened. */
  truncated: boolean;
}

/**
 * Spend a character budget across a list, in order, keeping whole items.
 *
 * Items are taken until the budget is exhausted rather than shrinking every
 * item to fit: a few complete diffs are far more useful to the model than
 * thirty fragments, and the count of omitted items tells it what it is missing
 * so it can ask for the rest.
 *
 * `size` measures an item's real cost; `atLeastOne` guarantees forward progress
 * so a single oversized item cannot produce a silently empty result.
 */
export function budgetList<T>(
  items: readonly T[],
  size: (item: T) => number,
  budget: number = DEFAULT_RESULT_BUDGET,
): BudgetedList<T> {
  const kept: T[] = [];
  let spent = 0;

  for (const item of items) {
    const cost = size(item);
    // Always keep the first item, even when it alone exceeds the budget —
    // an empty result would tell the model nothing at all.
    if (kept.length > 0 && spent + cost > budget) break;
    kept.push(item);
    spent += cost;
  }

  const omitted = items.length - kept.length;
  return { items: kept, omitted, truncated: omitted > 0 };
}
