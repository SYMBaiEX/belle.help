import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}

async function makeUser(t: ReturnType<typeof makeT>) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      aiMode: "managed",
      createdAt: Date.now(),
    });
  });
}

const BASE = {
  action: "merge_pr",
  repositoryFullName: "acme/widgets",
  prNumber: 42,
  headSha: "abc123",
};

async function makeApproval(
  t: ReturnType<typeof makeT>,
  userId: Awaited<ReturnType<typeof makeUser>>,
  overrides: Partial<{
    status: "pending" | "approved" | "denied" | "expired" | "consumed";
    expiresAt: number;
    headSha: string | undefined;
    action: string;
    repositoryFullName: string;
    prNumber: number | undefined;
  }> = {},
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("approvalRequests", {
      userId,
      action: overrides.action ?? BASE.action,
      repositoryFullName: overrides.repositoryFullName ?? BASE.repositoryFullName,
      prNumber: overrides.prNumber === undefined ? BASE.prNumber : overrides.prNumber,
      headSha: "headSha" in overrides ? overrides.headSha : BASE.headSha,
      prompt: "Merge this PR?",
      status: overrides.status ?? "approved",
      channel: "imessage",
      createdAt: Date.now(),
      expiresAt: overrides.expiresAt ?? Date.now() + 15 * 60 * 1000,
    });
  });
}

describe("convex/approvals:consume", () => {
  let t: ReturnType<typeof makeT>;

  beforeEach(() => {
    t = makeT();
  });

  it("happy path: consumes a matching approved approval", async () => {
    const userId = await makeUser(t);
    const approvalId = await makeApproval(t, userId);

    const result = await t.mutation(api.approvals.consume, {
      approvalId,
      userId,
      action: BASE.action,
      repositoryFullName: BASE.repositoryFullName,
      prNumber: BASE.prNumber,
      expectedHeadSha: BASE.headSha,
    });

    expect(result).toEqual({ ok: true });

    const stored = await t.run(async (ctx) => ctx.db.get(approvalId));
    expect(stored?.status).toBe("consumed");
  });

  it("head SHA mismatch fails and leaves status unchanged", async () => {
    const userId = await makeUser(t);
    const approvalId = await makeApproval(t, userId);

    const result = await t.mutation(api.approvals.consume, {
      approvalId,
      userId,
      action: BASE.action,
      repositoryFullName: BASE.repositoryFullName,
      prNumber: BASE.prNumber,
      expectedHeadSha: "different-sha",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/head sha/i);

    const stored = await t.run(async (ctx) => ctx.db.get(approvalId));
    expect(stored?.status).toBe("approved");
  });

  it("expired approval fails to consume", async () => {
    const userId = await makeUser(t);
    const approvalId = await makeApproval(t, userId, {
      expiresAt: Date.now() - 1000,
    });

    const result = await t.mutation(api.approvals.consume, {
      approvalId,
      userId,
      action: BASE.action,
      repositoryFullName: BASE.repositoryFullName,
      prNumber: BASE.prNumber,
      expectedHeadSha: BASE.headSha,
    });

    expect(result.ok).toBe(false);
  });

  it("wrong user fails to consume", async () => {
    const userId = await makeUser(t);
    const otherUserId = await makeUser(t);
    const approvalId = await makeApproval(t, userId);

    const result = await t.mutation(api.approvals.consume, {
      approvalId,
      userId: otherUserId,
      action: BASE.action,
      repositoryFullName: BASE.repositoryFullName,
      prNumber: BASE.prNumber,
      expectedHeadSha: BASE.headSha,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("wrong user");
  });

  it("wrong action fails to consume", async () => {
    const userId = await makeUser(t);
    const approvalId = await makeApproval(t, userId);

    const result = await t.mutation(api.approvals.consume, {
      approvalId,
      userId,
      action: "different_action",
      repositoryFullName: BASE.repositoryFullName,
      prNumber: BASE.prNumber,
      expectedHeadSha: BASE.headSha,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("wrong action");
  });

  it("wrong PR number fails to consume", async () => {
    const userId = await makeUser(t);
    const approvalId = await makeApproval(t, userId);

    const result = await t.mutation(api.approvals.consume, {
      approvalId,
      userId,
      action: BASE.action,
      repositoryFullName: BASE.repositoryFullName,
      prNumber: 999,
      expectedHeadSha: BASE.headSha,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("wrong PR");
  });

  it("pending (never approved) approval fails to consume", async () => {
    const userId = await makeUser(t);
    const approvalId = await makeApproval(t, userId, { status: "pending" });

    const result = await t.mutation(api.approvals.consume, {
      approvalId,
      userId,
      action: BASE.action,
      repositoryFullName: BASE.repositoryFullName,
      prNumber: BASE.prNumber,
      expectedHeadSha: BASE.headSha,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not approved");
  });

  it("double consume fails on the second call", async () => {
    const userId = await makeUser(t);
    const approvalId = await makeApproval(t, userId);

    const first = await t.mutation(api.approvals.consume, {
      approvalId,
      userId,
      action: BASE.action,
      repositoryFullName: BASE.repositoryFullName,
      prNumber: BASE.prNumber,
      expectedHeadSha: BASE.headSha,
    });
    expect(first.ok).toBe(true);

    const second = await t.mutation(api.approvals.consume, {
      approvalId,
      userId,
      action: BASE.action,
      repositoryFullName: BASE.repositoryFullName,
      prNumber: BASE.prNumber,
      expectedHeadSha: BASE.headSha,
    });

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("not approved");
  });
});
