import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { isPaused } from "../../agent/lib/paused";

afterEach(() => {
  delete process.env.BELLE_PAUSED;
});

describe("pause switch", () => {
  it("runs normally when unset", () => {
    expect(isPaused()).toBe(false);
  });

  it("pauses on the values a human would actually type", () => {
    for (const value of ["1", "true", "yes", "TRUE", " 1 ", "on"]) {
      process.env.BELLE_PAUSED = value;
      expect(isPaused(), `BELLE_PAUSED=${JSON.stringify(value)}`).toBe(true);
    }
  });

  it("treats explicit falsy values as running", () => {
    for (const value of ["0", "false", "FALSE", ""]) {
      process.env.BELLE_PAUSED = value;
      expect(isPaused(), `BELLE_PAUSED=${JSON.stringify(value)}`).toBe(false);
    }
  });
});

describe("pause coverage", () => {
  /**
   * A pause with a gap is worse than no pause: it reads as "off" while a cron
   * quietly keeps billing inference. Every schedule is a recurring, unattended
   * cost, so each one must check.
   */
  it("every schedule checks isPaused", () => {
    const dir = "agent/schedules";
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);

    const unguarded = files.filter(
      (f) => !readFileSync(join(dir, f), "utf8").includes("isPaused()"),
    );
    expect(unguarded, "these schedules would still run while paused").toEqual([]);
  });

  it("has no markdown schedules, which cannot be paused", () => {
    // Markdown schedules are fire-and-forget task mode: eve dispatches a model
    // session every tick with no place to put a condition. One of these was
    // running a session every 30 minutes purely to find nothing to do.
    const markdown = readdirSync("agent/schedules").filter((f) => f.endsWith(".md"));
    expect(markdown, "markdown schedules cannot honour BELLE_PAUSED").toEqual([]);
  });

  it("both inbound channels check isPaused", () => {
    for (const channel of ["agent/channels/linq.ts", "agent/channels/github.ts"]) {
      expect(readFileSync(channel, "utf8"), `${channel} would still reach the model`).toContain(
        "isPaused()",
      );
    }
  });
});
