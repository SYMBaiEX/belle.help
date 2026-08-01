import { beforeEach, describe, expect, it } from "vitest";

const VALID_KEY = "a".repeat(64);

describe("lib/encryption", () => {
  beforeEach(() => {
    process.env.APP_ENCRYPTION_KEY = VALID_KEY;
  });

  it("round-trips a secret through encrypt/decrypt", async () => {
    const { encryptSecret, decryptSecret } = await import("../../lib/encryption");
    const payload = encryptSecret("sk-super-secret-value");
    expect(payload.keyVersion).toBe(1);
    expect(decryptSecret(payload)).toBe("sk-super-secret-value");
  });

  it("produces stable, non-reversible phone hashes and last4", async () => {
    const { hashPhone, last4 } = await import("../../lib/encryption");
    const hash1 = hashPhone("+15551234567");
    const hash2 = hashPhone("+15551234567");
    expect(hash1).toBe(hash2);
    expect(hash1).not.toContain("5551234567");
    expect(last4("+15551234567")).toBe("4567");
  });

  it("fails to decrypt with a different key", async () => {
    const encryption = await import("../../lib/encryption");
    const payload = encryption.encryptSecret("top-secret");

    // Force a fresh module instance with a different key so the cached
    // key from beforeEach doesn't leak across the "instances".
    process.env.APP_ENCRYPTION_KEY = "b".repeat(64);
    // @ts-expect-error -- vitest module-instance-busting query import
    const wrongKeyModule = await import("../../lib/encryption?variant=wrong-key");
    expect(() => wrongKeyModule.decryptSecret(payload)).toThrow();
  });

  it("throws a clear error when APP_ENCRYPTION_KEY is missing", async () => {
    delete process.env.APP_ENCRYPTION_KEY;
    // @ts-expect-error -- vitest module-instance-busting query import
    const mod = await import("../../lib/encryption?variant=missing-key");
    expect(() => mod.encryptSecret("x")).toThrow(/APP_ENCRYPTION_KEY/);
  });

  it("throws a clear error when APP_ENCRYPTION_KEY is malformed", async () => {
    process.env.APP_ENCRYPTION_KEY = "not-hex-and-wrong-length";
    // @ts-expect-error -- vitest module-instance-busting query import
    const mod = await import("../../lib/encryption?variant=malformed-key");
    expect(() => mod.encryptSecret("x")).toThrow(/64 hex characters/);
  });
});
