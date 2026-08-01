import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

async function makeUser(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      aiMode: "managed",
      createdAt: Date.now(),
    });
  });
}

describe("convex/conversationContexts", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("upsert with only userId+linqChatId does not clear a previously set activePrNumber", async () => {
    const userId = await makeUser(t);

    await t.mutation(api.conversationContexts.upsert, {
      userId,
      linqChatId: "chat_1",
      activeRepositoryFullName: "acme/widgets",
      activePrNumber: 7,
      activeHeadSha: "sha7",
    });

    // Partial patch: caller only supplies userId + linqChatId (e.g. a bare
    // context refresh). This must NOT wipe the previously set active PR.
    await t.mutation(api.conversationContexts.upsert, {
      userId,
      linqChatId: "chat_1",
    });

    const stored = await t.query(api.conversationContexts.getByLinqChatId, {
      linqChatId: "chat_1",
    });

    expect(stored?.activePrNumber).toBe(7);
    expect(stored?.activeRepositoryFullName).toBe("acme/widgets");
    expect(stored?.activeHeadSha).toBe("sha7");
  });

  it("setActivePr updates the newest context for the user", async () => {
    const userId = await makeUser(t);

    await t.mutation(api.conversationContexts.upsert, {
      userId,
      linqChatId: "chat_old",
    });
    // Ensure a distinct updatedAt ordering between the two contexts.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await t.mutation(api.conversationContexts.upsert, {
      userId,
      linqChatId: "chat_new",
    });

    await t.mutation(api.conversationContexts.setActivePr, {
      userId,
      repositoryFullName: "acme/widgets",
      prNumber: 99,
      headSha: "sha99",
    });

    const newest = await t.query(api.conversationContexts.getByLinqChatId, {
      linqChatId: "chat_new",
    });
    const older = await t.query(api.conversationContexts.getByLinqChatId, {
      linqChatId: "chat_old",
    });

    expect(newest?.activePrNumber).toBe(99);
    expect(newest?.activeRepositoryFullName).toBe("acme/widgets");
    expect(older?.activePrNumber).toBeUndefined();
  });
});
