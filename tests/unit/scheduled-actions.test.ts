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

describe("convex/scheduledActions", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("listDue excludes actions with runAfter in the future and includes past/unset ones", async () => {
    const userId = await makeUser(t);
    const now = Date.now();

    const dueUnset = await t.mutation(api.scheduledActions.enqueue, {
      userId,
      kind: "reminder",
    });
    const duePast = await t.mutation(api.scheduledActions.enqueue, {
      userId,
      kind: "reminder",
      runAfter: now - 1000,
    });
    const notDueFuture = await t.mutation(api.scheduledActions.enqueue, {
      userId,
      kind: "reminder",
      runAfter: now + 60_000,
    });

    const due = await t.query(api.scheduledActions.listDue, { now });
    const dueIds = due.map((a) => a._id);

    expect(dueIds).toContain(dueUnset);
    expect(dueIds).toContain(duePast);
    expect(dueIds).not.toContain(notDueFuture);
  });

  it("markDispatched removes the action from listDue", async () => {
    const userId = await makeUser(t);
    const now = Date.now();

    const actionId = await t.mutation(api.scheduledActions.enqueue, {
      userId,
      kind: "reminder",
      runAfter: now - 1000,
    });

    let due = await t.query(api.scheduledActions.listDue, { now });
    expect(due.map((a) => a._id)).toContain(actionId);

    await t.mutation(api.scheduledActions.markDispatched, { actionId });

    due = await t.query(api.scheduledActions.listDue, { now });
    expect(due.map((a) => a._id)).not.toContain(actionId);

    const stored = await t.run(async (ctx) => ctx.db.get(actionId));
    expect(stored?.status).toBe("dispatched");
    expect(stored?.dispatchedAt).toBeDefined();
  });
});
