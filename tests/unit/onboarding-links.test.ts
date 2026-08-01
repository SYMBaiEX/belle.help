import { beforeEach, describe, expect, it } from "vitest";

const VALID_KEY = "c".repeat(64);

describe("lib/security/onboarding-links", () => {
  beforeEach(() => {
    process.env.APP_ENCRYPTION_KEY = VALID_KEY;
  });

  it("round-trips a valid token", async () => {
    const { createOnboardingToken, verifyOnboardingToken } = await import(
      "../../lib/security/onboarding-links"
    );

    const { token, tokenHash, expiresAt } = createOnboardingToken({
      linqChatId: "chat_123",
      phoneHash: "hash_abc",
    });

    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(tokenHash).toHaveLength(64);
    expect(expiresAt).toBeGreaterThan(Date.now());

    const payload = verifyOnboardingToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.linqChatId).toBe("chat_123");
    expect(payload?.phoneHash).toBe("hash_abc");
  });

  it("rejects a tampered signature", async () => {
    const { createOnboardingToken, verifyOnboardingToken } = await import(
      "../../lib/security/onboarding-links"
    );

    const { token } = createOnboardingToken({
      linqChatId: "chat_123",
      phoneHash: "hash_abc",
    });

    const [payloadPart, signaturePart] = token.split(".");
    const tamperedSignature =
      signaturePart.slice(0, -1) + (signaturePart.endsWith("A") ? "B" : "A");
    const tamperedToken = `${payloadPart}.${tamperedSignature}`;

    expect(verifyOnboardingToken(tamperedToken)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const { createOnboardingToken, verifyOnboardingToken } = await import(
      "../../lib/security/onboarding-links"
    );

    const { token } = createOnboardingToken({
      linqChatId: "chat_123",
      phoneHash: "hash_abc",
    });

    const [, signaturePart] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({
        linqChatId: "attacker_chat",
        phoneHash: "hash_abc",
        nonce: "forged",
        iat: Date.now(),
        exp: Date.now() + 1000 * 60,
      }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(verifyOnboardingToken(`${forgedPayload}.${signaturePart}`)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { createOnboardingToken, verifyOnboardingToken } = await import(
      "../../lib/security/onboarding-links"
    );

    const { token } = createOnboardingToken(
      { linqChatId: "chat_123", phoneHash: "hash_abc" },
      -1000,
    );

    expect(verifyOnboardingToken(token)).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    const { verifyOnboardingToken } = await import(
      "../../lib/security/onboarding-links"
    );

    expect(verifyOnboardingToken("not-a-token")).toBeNull();
    expect(verifyOnboardingToken("")).toBeNull();
    expect(verifyOnboardingToken("a.b.c")).toBeNull();
  });
});
