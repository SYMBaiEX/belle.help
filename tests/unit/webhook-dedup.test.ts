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

  it("returns duplicate:false the first time and duplicate:true the second time", async () => {
    const first = await t.mutation(api.webhookEvents.recordIfNew, {
      provider: "github",
      externalEventId: "evt_1",
      eventType: "pull_request",
      verified: true,
    });
    expect(first.duplicate).toBe(false);

    const second = await t.mutation(api.webhookEvents.recordIfNew, {
      provider: "github",
      externalEventId: "evt_1",
      eventType: "pull_request",
      verified: true,
    });
    expect(second.duplicate).toBe(true);
    expect(second.id).toEqual(first.id);
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
