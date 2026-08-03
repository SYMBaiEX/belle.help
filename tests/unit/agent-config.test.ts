import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guard the two settings that decide whether Belle can interrupt a
 * conversation to talk about its own accounting.
 *
 * A session token budget is not a cost control on a texting product — it is a
 * mid-conversation prompt ("just approve to keep going") that parks the session
 * and holds every later message until it is answered. That is what silenced
 * Belle for two days, and it is invisible in code review because the config
 * reads like a sensible safety limit.
 *
 * Spend belongs in per-user quotas (`usageEvents`), which can refuse work
 * before it starts rather than stranding a half-finished conversation.
 */
const source = readFileSync("agent/agent.ts", "utf8");

describe("root agent config", () => {
  it("never caps session input tokens", () => {
    const match = /maxInputTokensPerSession:\s*([^,\n]+)/.exec(source);
    expect(match, "maxInputTokensPerSession should be present and explicit").not.toBeNull();
    expect(
      match![1]!.trim(),
      "A numeric cap re-introduces the continuation prompt that swallows user messages",
    ).toBe("false");
  });

  it("never caps session output tokens", () => {
    // Output budgets raise the same prompt through the same code path.
    const match = /maxOutputTokensPerSession:\s*([^,\n]+)/.exec(source);
    if (match) expect(match[1]!.trim()).toBe("false");
  });

  it("compacts before the context window is nearly full", () => {
    const match = /thresholdPercent:\s*([\d.]+)/.exec(source);
    expect(match, "compaction.thresholdPercent should be set explicitly").not.toBeNull();
    const threshold = Number(match![1]);
    expect(threshold).toBeGreaterThan(0);
    expect(threshold).toBeLessThanOrEqual(0.9);
  });
});
