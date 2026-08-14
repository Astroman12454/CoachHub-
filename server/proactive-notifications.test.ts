// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";

const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification,
  },
}));

import { setupAuth, requireAuth } from "./auth";
import { registerRoutes } from "./routes";

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
  await agent.post("/api/signup").send({ email, password: PASSWORD });
  return agent;
}

// Creates a player, generates a portal link, and subscribes a fake endpoint
// to it — the same flow a real parent goes through, minus the browser.
async function playerWithSubscription(agent: request.Agent, app: express.Express, name: string) {
  const player = await agent.post("/api/players").send({ name });
  const link = await agent.post(`/api/players/${player.body.id}/portal-link`);
  await request(app).post(`/api/portal/${link.body.token}/subscribe`).send({
    endpoint: `https://push.example.com/${player.body.id}`,
    keys: { p256dh: "p256dh-key", auth: "auth-key" },
  });
  return player.body as { id: number; name: string };
}

// A timed evaluation test: worstValue > bestValue (slower = worse).
function sprintTest(overrides: Partial<Record<string, unknown>> = {}) {
  return { name: "Sprint", type: "time", unit: "seconds", worstValue: 15, bestValue: 5, ...overrides };
}

describe("proactive parent-mode notifications", () => {
  let app: express.Express;

  beforeAll(async () => {
    process.env.VAPID_PUBLIC_KEY = "test-public-key";
    process.env.VAPID_PRIVATE_KEY = "test-private-key";
    app = await createTestApp();
  });

  beforeEach(() => {
    sendNotification.mockReset().mockResolvedValue(undefined);
  });

  it("pushes to the player's own subscribers when an evaluation score improves, mentioning the test and the before/after score", async () => {
    const agent = await signedInAgent(app);
    const player = await playerWithSubscription(agent, app, "Riley");
    const test = await agent.post("/api/evaluation-tests").send(sprintTest());

    await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({ date: "2026-08-01", results: [{ playerId: player.id, value: 10 }] }); // score 51
    sendNotification.mockClear();
    await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({ date: "2026-08-08", results: [{ playerId: player.id, value: 8 }] }); // score 70

    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [subscriptionArg, payloadArg] = sendNotification.mock.calls[0];
    expect(subscriptionArg.endpoint).toBe(`https://push.example.com/${player.id}`);
    const payload = JSON.parse(payloadArg);
    expect(payload.body).toContain("Sprint 51→70");
  });

  it("does not push when nothing improved (an equal or worse score)", async () => {
    const agent = await signedInAgent(app);
    const player = await playerWithSubscription(agent, app, "Morgan");
    const test = await agent.post("/api/evaluation-tests").send(sprintTest());

    await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({ date: "2026-08-01", results: [{ playerId: player.id, value: 10 }] });
    sendNotification.mockClear();
    await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({ date: "2026-08-08", results: [{ playerId: player.id, value: 10 }] });
    expect(sendNotification).not.toHaveBeenCalled();

    await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({ date: "2026-08-15", results: [{ playerId: player.id, value: 12 }] }); // slower — worse score
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does not push on a player's very first result — there's nothing to compare it against", async () => {
    const agent = await signedInAgent(app);
    const player = await playerWithSubscription(agent, app, "Alex");
    const test = await agent.post("/api/evaluation-tests").send(sprintTest());

    await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({ date: "2026-08-01", results: [{ playerId: player.id, value: 10 }] });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("pushes to the player marked absent when creating attendance, but not for present", async () => {
    const agent = await signedInAgent(app);
    const player = await playerWithSubscription(agent, app, "Devon");
    const session = await agent.post("/api/training-sessions").send({
      name: "Practice", date: "2026-09-01", time: "17:00", duration: 60,
    });

    await agent.post("/api/attendance").send({ sessionId: session.body.id, playerId: player.id, status: "present" });
    expect(sendNotification).not.toHaveBeenCalled();

    await agent.post("/api/attendance").send({ sessionId: session.body.id, playerId: player.id, status: "absent" });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [, payloadArg] = sendNotification.mock.calls[0];
    const payload = JSON.parse(payloadArg);
    expect(payload.title).toBe("Absence recorded");
    expect(payload.body).toContain("Devon");
    expect(payload.body).toContain("Practice");
  });

  it("pushes when an existing attendance record is updated to absent", async () => {
    const agent = await signedInAgent(app);
    const player = await playerWithSubscription(agent, app, "Sam");
    const session = await agent.post("/api/training-sessions").send({
      name: "Scrimmage", date: "2026-09-02", time: "18:00", duration: 60,
    });
    const attendance = await agent.post("/api/attendance").send({ sessionId: session.body.id, playerId: player.id, status: "present" });
    sendNotification.mockClear();

    await agent.put(`/api/attendance/${attendance.body.id}`).send({ status: "absent" });
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("never pushes to a different player's subscribers", async () => {
    const agent = await signedInAgent(app);
    const playerA = await playerWithSubscription(agent, app, "Player A");
    const playerB = await playerWithSubscription(agent, app, "Player B");
    const session = await agent.post("/api/training-sessions").send({
      name: "Practice", date: "2026-09-03", time: "17:00", duration: 60,
    });

    await agent.post("/api/attendance").send({ sessionId: session.body.id, playerId: playerA.id, status: "absent" });

    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [subscriptionArg] = sendNotification.mock.calls[0];
    expect(subscriptionArg.endpoint).toBe(`https://push.example.com/${playerA.id}`);
    expect(subscriptionArg.endpoint).not.toBe(`https://push.example.com/${playerB.id}`);
  });
});
