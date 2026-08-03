import { afterEach, describe, expect, it } from "vitest";

import { bearerToken, internalToken, verifyInternalToken } from "../../lib/security/internal-token";

const VALID = "a".repeat(48);

afterEach(() => {
  delete process.env.BELLE_INTERNAL_TOKEN;
});

describe("internal service token", () => {
  it("rejects a token that is unset", () => {
    expect(internalToken()).toBeNull();
    expect(verifyInternalToken(VALID)).toBe(false);
  });

  it("rejects a configured secret that is too short to be a real secret", () => {
    process.env.BELLE_INTERNAL_TOKEN = "short";
    expect(internalToken()).toBeNull();
    // Critically, a weak configured value must not authenticate *itself* —
    // otherwise a placeholder like "changeme" becomes a live credential.
    expect(verifyInternalToken("short")).toBe(false);
  });

  it("accepts the exact configured token", () => {
    process.env.BELLE_INTERNAL_TOKEN = VALID;
    expect(verifyInternalToken(VALID)).toBe(true);
  });

  it("rejects near-misses, empty input, and missing input", () => {
    process.env.BELLE_INTERNAL_TOKEN = VALID;
    expect(verifyInternalToken(`${VALID}x`)).toBe(false);
    expect(verifyInternalToken(VALID.slice(0, -1))).toBe(false);
    expect(verifyInternalToken("")).toBe(false);
    expect(verifyInternalToken(null)).toBe(false);
    expect(verifyInternalToken(undefined)).toBe(false);
  });

  it("does not throw on length mismatch", () => {
    // timingSafeEqual throws on unequal buffer lengths; hashing both sides
    // first is what prevents a length oracle. Guard the property directly.
    process.env.BELLE_INTERNAL_TOKEN = VALID;
    expect(() => verifyInternalToken("x")).not.toThrow();
    expect(() => verifyInternalToken("y".repeat(4096))).not.toThrow();
  });
});

describe("bearer token parsing", () => {
  it("extracts the token regardless of scheme casing and padding", () => {
    expect(bearerToken("Bearer abc123")).toBe("abc123");
    expect(bearerToken("bearer abc123")).toBe("abc123");
    expect(bearerToken("  Bearer   abc123  ")).toBe("abc123");
  });

  it("returns null for anything that is not a bearer credential", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken("")).toBeNull();
    expect(bearerToken("Basic abc123")).toBeNull();
    expect(bearerToken("abc123")).toBeNull();
  });
});
