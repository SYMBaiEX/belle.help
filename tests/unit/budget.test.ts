import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { budgetList, capText, DEFAULT_RESULT_BUDGET } from "../../agent/lib/budget";

describe("capText", () => {
  it("leaves short text alone", () => {
    expect(capText("hello", 100)).toEqual({ text: "hello", truncated: false });
  });

  it("marks truncated text so the model knows it is partial", () => {
    const result = capText("x".repeat(50), 10);
    expect(result.truncated).toBe(true);
    expect(result.text.startsWith("x".repeat(10))).toBe(true);
    expect(result.text).toContain("truncated");
  });
});

describe("budgetList", () => {
  const size = (s: string) => s.length;

  it("keeps everything when the total fits", () => {
    const result = budgetList(["aa", "bb", "cc"], size, 100);
    expect(result.items).toEqual(["aa", "bb", "cc"]);
    expect(result.omitted).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("stops at the budget and reports what it dropped", () => {
    const result = budgetList(["aaaa", "bbbb", "cccc"], size, 9);
    expect(result.items).toEqual(["aaaa", "bbbb"]);
    expect(result.omitted).toBe(1);
    expect(result.truncated).toBe(true);
  });

  it("keeps whole items rather than fragments", () => {
    // Two complete diffs beat three partial ones — a fragment of a patch can
    // be actively misleading about what a change does.
    const result = budgetList(["aaaaa", "bbbbb", "ccccc"], size, 12);
    expect(result.items).toEqual(["aaaaa", "bbbbb"]);
  });

  it("always returns at least one item, even if it alone busts the budget", () => {
    // An empty result tells the model nothing and invites a blind retry.
    const result = budgetList(["x".repeat(10_000), "b"], size, 10);
    expect(result.items).toHaveLength(1);
    expect(result.omitted).toBe(1);
  });

  it("handles an empty list", () => {
    const result = budgetList([], size, 100);
    expect(result.items).toEqual([]);
    expect(result.omitted).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("bounds the total, not each item — the bug that blew out context", () => {
    // Thirty items at a 4,000-char per-item limit is 120,000 characters, which
    // is exactly how a "safe" per-file truncation produced ~30k-token results.
    const items = Array.from({ length: 30 }, () => "x".repeat(4_000));
    const result = budgetList(items, size, DEFAULT_RESULT_BUDGET);
    const total = result.items.reduce((sum, s) => sum + s.length, 0);
    expect(total).toBeLessThanOrEqual(DEFAULT_RESULT_BUDGET);
    expect(result.omitted).toBeGreaterThan(0);
  });
});

describe("tools that can return bulk data spend a shared budget", () => {
  // A per-item cap with no total is the shape of the original defect, so guard
  // the tools where output size actually scales with someone else's data.
  const BULK_TOOLS = [
    "agent/tools/list_pull_request_files.ts",
    "agent/tools/get_check_logs.ts",
  ];

  for (const path of BULK_TOOLS) {
    it(`${path} bounds its whole result`, () => {
      const source = readFileSync(path, "utf8");
      expect(source, "should spend a shared budget across items").toContain("budgetList");
    });
  }

  it("list_repositories caps how many repositories it returns", () => {
    const source = readFileSync("agent/tools/list_repositories.ts", "utf8");
    expect(source).toContain("PAGE_LIMIT");
    expect(source).toMatch(/slice\(0,\s*PAGE_LIMIT\)/);
  });
});
