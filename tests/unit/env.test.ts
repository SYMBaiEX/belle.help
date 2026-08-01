import { afterEach, beforeEach, describe, expect, it } from "vitest";

const VALID_KEY = "d".repeat(64);
const ENV_KEYS = [
  "APP_ENCRYPTION_KEY",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_BELLE_PHONE_NUMBER",
  "LINQ_API_KEY",
  "LINQ_API_BASE_URL",
  "LINQ_WEBHOOK_SECRET",
  "NEXT_PUBLIC_CONVEX_URL",
  "CONVEX_DEPLOYMENT",
  "OPENAI_API_KEY",
  "AI_GATEWAY_API_KEY",
] as const;

let savedEnv: Record<string, string | undefined>;

describe("lib/env", () => {
  beforeEach(() => {
    savedEnv = {};
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("throws a clear, actionable error when APP_ENCRYPTION_KEY is missing", async () => {
    // @ts-expect-error -- vitest module-instance-busting query import
    const mod = await import("../../lib/env?variant=missing");
    expect(() => mod.env.NEXT_PUBLIC_APP_URL).toThrow(/APP_ENCRYPTION_KEY/);
  });

  it("parses successfully with a valid key and applies defaults", async () => {
    process.env.APP_ENCRYPTION_KEY = VALID_KEY;
    // @ts-expect-error -- vitest module-instance-busting query import
    const mod = await import("../../lib/env?variant=valid");
    expect(mod.env.APP_ENCRYPTION_KEY).toBe(VALID_KEY);
    expect(mod.env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
    expect(mod.env.LINQ_API_BASE_URL).toBe("https://api.linqapp.com");
  });

  it("requireEnv throws naming the missing variable", async () => {
    process.env.APP_ENCRYPTION_KEY = VALID_KEY;
    // @ts-expect-error -- vitest module-instance-busting query import
    const mod = await import("../../lib/env?variant=require");
    expect(() => mod.requireEnv("LINQ_API_KEY")).toThrow(/LINQ_API_KEY/);
  });
});
