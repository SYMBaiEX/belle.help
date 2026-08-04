/**
 * Global pause switch.
 *
 * Set `BELLE_PAUSED=1` and Belle stops doing anything that costs money or
 * reaches a user: no inbound message reaches the model, no GitHub event opens
 * a session, and no schedule runs. The deployment stays up and the website
 * keeps serving; only the agent goes quiet.
 *
 * Why this exists rather than just removing API keys: a cron fires whether or
 * not credentials are present. A markdown schedule dispatches a full model
 * session on its cadence, so an unguarded schedule keeps billing inference
 * while every tool inside it fails on missing configuration — the worst of
 * both. Credentials gate *access*; this gates *activity*.
 *
 * Unpausing is one environment variable and a redeploy. Nothing is deleted.
 */
export function isPaused(): boolean {
  const value = process.env.BELLE_PAUSED;
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  // Anything explicitly falsy means running; everything else means paused, so
  // a typo fails safe (paused) rather than quietly resuming a paused agent.
  return normalized !== "0" && normalized !== "false" && normalized !== "";
}

/** Log once per invocation that something was skipped because Belle is paused. */
export function logPaused(what: string): void {
  console.info(`[paused] skipped ${what} — BELLE_PAUSED is set`);
}
