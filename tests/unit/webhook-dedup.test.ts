import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("convex/webhookEvents:recordIfNew", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("suppresses a redelivery only after the first run reached processed", async () => {
    // Regression guard: a real pull_request event was recorded, the invocation
    // then died before texting the user, and the stale "received" row made
    // every GitHub retry look like a duplicate — the notification was lost for
    // good. Only a run that reached "processed" may suppress a redelivery.
    const first = await t.mutation(api.webhookEvents.recordIfNew, {
      provider: "github",
      externalEventId: "evt_1",
      eventType: "pull_request",
      verified: true,
    });
    expect(first.duplicate).toBe(false);

    const retryAfterCrash = await t.mutation(api.webhookEvents.recordIfNew, {
      provider: "github",
      externalEventId: "evt_1",
      eventType: "pull_request",
      verified: true,
    });
    expect(retryAfterCrash.duplicate).toBe(false);
    expect(retryAfterCrash.id).toEqual(first.id);

    await t.mutation(api.webhookEvents.markProcessed, { id: first.id });

    const afterSuccess = await t.mutation(api.webhookEvents.recordIfNew, {
      provider: "github",
      externalEventId: "evt_1",
      eventType: "pull_request",
      verified: true,
    });
    expect(afterSuccess.duplicate).toBe(true);
    expect(afterSuccess.id).toEqual(first.id);
  });

  it("treats the same externalEventId from a different provider as not duplicate", async () => {
    const first = await t.mutation(api.webhookEvents.recordIfNew, {
      provider: "github",
      externalEventId: "evt_shared",
      eventType: "pull_request",
      verified: true,
    });
    expect(first.duplicate).toBe(false);

    const second = await t.mutation(api.webhookEvents.recordIfNew, {
      provider: "linq",
      externalEventId: "evt_shared",
      eventType: "message",
      verified: true,
    });
    expect(second.duplicate).toBe(false);
    expect(second.id).not.toEqual(first.id);
  });
});
