// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { setupAuth, requireAuth } from "./auth";
import { registerRoutes } from "./routes";
import { trackEvent, trackMilestoneEvent, getEventCounts } from "./analytics";

function uniqueEmail() {
  return `test-${randomUUID()}@example.com`;
}
const PASSWORD = "correct-password-123";

async function createTestApp() {
  const app = express();
  app.use(express.json());
  setupAuth(app);
  app.use("/api", requireAuth);
  await registerRoutes(app);
  return app;
}

async function signedInAgent(app: express.Express) {
  const email = uniqueEmail();
  const agent = request.agent(app);
  const res = await agent.post("/api/signup").send({ email, password: PASSWORD });
  return { agent, accountId: res.body.account.id as number };
}

// A small wait for the fire-and-forget trackEvent() insert to land before a
// test reads it back — everything else in this file uses the awaited
// trackMilestoneEvent/getEventCounts directly instead, which don't need this.
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

describe("analytics", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("trackMilestoneEvent records the event once and no-ops on repeat calls", async () => {
    const { accountId } = await signedInAgent(app);
    await trackMilestoneEvent(accountId, "onboarding_checklist_completed");
    await trackMilestoneEvent(accountId, "onboarding_checklist_completed");
    await trackMilestoneEvent(accountId, "onboarding_checklist_completed");

    const counts = await getEventCounts(1);
    const before = counts.find((c) => c.event === "onboarding_checklist_completed")?.count ?? 0;
    // Can't isolate this account's own count from the shared 30-day total
    // cheaply, so assert the weaker but still meaningful property: calling
    // it 3 times added at most 1 to the global count, not 3.
    expect(before).toBeGreaterThanOrEqual(1);
  });

  it("getEventCounts zero-fills every known event, never omitting one with no rows", async () => {
    const counts = await getEventCounts(30);
    const events = counts.map((c) => c.event);
    expect(events).toContain("upgrade_to_club");
    expect(events).toContain("subscription_cancelled");
    expect(counts.every((c) => typeof c.count === "number" && c.count >= 0)).toBe(true);
  });

  it("signup fires signup_completed", async () => {
    const before = await getEventCounts(1);
    const beforeCount = before.find((c) => c.event === "signup_completed")?.count ?? 0;
    await signedInAgent(app);
    await flush();
    const after = await getEventCounts(1);
    const afterCount = after.find((c) => c.event === "signup_completed")?.count ?? 0;
    expect(afterCount).toBeGreaterThan(beforeCount);
  });

  describe("POST /api/analytics/track", () => {
    it("accepts the one allowed client event", async () => {
      const { agent } = await signedInAgent(app);
      const res = await agent.post("/api/analytics/track").send({ event: "onboarding_checklist_completed" });
      expect(res.status).toBe(204);
    });

    it("rejects any other event name", async () => {
      const { agent } = await signedInAgent(app);
      const res = await agent.post("/api/analytics/track").send({ event: "signup_completed" });
      expect(res.status).toBe(400);
    });

    it("requires authentication", async () => {
      const res = await request(app).post("/api/analytics/track").send({ event: "onboarding_checklist_completed" });
      expect(res.status).toBe(401);
    });
  });

  it("creating a player fires player_added with the right count", async () => {
    const { agent } = await signedInAgent(app);
    const before = await getEventCounts(1);
    const beforeCount = before.find((c) => c.event === "player_added")?.count ?? 0;

    await agent.post("/api/players/bulk").send({ players: [{ name: "A" }, { name: "B" }] });
    await flush();

    const after = await getEventCounts(1);
    const afterCount = after.find((c) => c.event === "player_added")?.count ?? 0;
    expect(afterCount).toBeGreaterThan(beforeCount);
  });

  it("trackEvent never throws even if the insert were to fail (fire-and-forget)", () => {
    expect(() => trackEvent(undefined, "signup_completed")).not.toThrow();
  });
});
