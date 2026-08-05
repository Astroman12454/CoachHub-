// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from "vitest";
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

describe("push notifications", () => {
  let app: express.Express;

  beforeAll(async () => {
    process.env.VAPID_PUBLIC_KEY = "test-public-key";
    process.env.VAPID_PRIVATE_KEY = "test-private-key";
    app = await createTestApp();
  });

  it("exposes the VAPID public key on the portal payload when configured", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Devon" });
    const link = await agent.post(`/api/players/${player.body.id}/portal-link`);

    const anon = request(app);
    const portal = await anon.get(`/api/portal/${link.body.token}`);
    expect(portal.body.vapidPublicKey).toBe("test-public-key");
  });

  it("subscribes and unsubscribes a player to push notifications via their portal token", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Alex" });
    const link = await agent.post(`/api/players/${player.body.id}/portal-link`);
    const anon = request(app);

    const sub = await anon.post(`/api/portal/${link.body.token}/subscribe`).send({
      endpoint: "https://push.example.com/abc",
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    });
    expect(sub.status).toBe(204);

    const unsub = await anon.delete(`/api/portal/${link.body.token}/subscribe`).send({
      endpoint: "https://push.example.com/abc",
    });
    expect(unsub.status).toBe(204);
  });

  it("404s subscribing with an unknown token", async () => {
    const anon = request(app);
    const res = await anon.post("/api/portal/does-not-exist/subscribe").send({
      endpoint: "https://push.example.com/xyz",
      keys: { p256dh: "a", auth: "b" },
    });
    expect(res.status).toBe(404);
  });

  it("rejects a malformed subscription body", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Morgan" });
    const link = await agent.post(`/api/players/${player.body.id}/portal-link`);
    const anon = request(app);

    const res = await anon.post(`/api/portal/${link.body.token}/subscribe`).send({ endpoint: "not-a-url" });
    expect(res.status).toBe(400);
  });

  it("sends a push to every subscribed player when the coach notifies a training session", async () => {
    sendNotification.mockResolvedValue(undefined);
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Riley" });
    const link = await agent.post(`/api/players/${player.body.id}/portal-link`);
    const anon = request(app);
    await anon.post(`/api/portal/${link.body.token}/subscribe`).send({
      endpoint: "https://push.example.com/riley",
      keys: { p256dh: "p", auth: "a" },
    });

    const session = await agent.post("/api/training-sessions").send({
      name: "Ball handling", date: "2026-09-01", time: "17:00", duration: 45,
    });

    const notify = await agent.post(`/api/training-sessions/${session.body.id}/notify`);
    expect(notify.status).toBe(200);
    expect(notify.body.sent).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);

    const [subscriptionArg, payloadArg] = sendNotification.mock.calls[0];
    expect(subscriptionArg.endpoint).toBe("https://push.example.com/riley");
    const payload = JSON.parse(payloadArg);
    expect(payload.title).toContain("Ball handling");
    expect(payload.url).toBe(`/portal/${link.body.token}`);
  });

  it("prunes a subscription that comes back expired (410) and future notifies skip it", async () => {
    sendNotification.mockReset();
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Sky" });
    const link = await agent.post(`/api/players/${player.body.id}/portal-link`);
    const anon = request(app);
    await anon.post(`/api/portal/${link.body.token}/subscribe`).send({
      endpoint: "https://push.example.com/sky",
      keys: { p256dh: "p", auth: "a" },
    });
    const game = await agent.post("/api/games").send({ opponent: "Rivals", date: "2026-09-10" });

    const notify = await agent.post(`/api/games/${game.body.id}/notify`);
    expect(notify.status).toBe(200);
    expect(notify.body.sent).toBe(0);

    sendNotification.mockClear();
    await agent.post(`/api/games/${game.body.id}/notify`);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("only notifies players on the notifying coach's own team", async () => {
    sendNotification.mockReset();
    sendNotification.mockResolvedValue(undefined);

    const teamA = await signedInAgent(app);
    const playerA = await teamA.post("/api/players").send({ name: "Team A Player" });
    const linkA = await teamA.post(`/api/players/${playerA.body.id}/portal-link`);
    const anon = request(app);
    await anon.post(`/api/portal/${linkA.body.token}/subscribe`).send({
      endpoint: "https://push.example.com/team-a",
      keys: { p256dh: "p", auth: "a" },
    });

    const teamB = await signedInAgent(app);
    const sessionB = await teamB.post("/api/training-sessions").send({
      name: "Team B practice", date: "2026-09-05", time: "16:00", duration: 60,
    });

    const notify = await teamB.post(`/api/training-sessions/${sessionB.body.id}/notify`);
    expect(notify.body.sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("returns 503 for notify when push isn't configured", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const agent = await signedInAgent(app);
    const session = await agent.post("/api/training-sessions").send({
      name: "Test", date: "2026-09-01", time: "10:00", duration: 30,
    });
    const res = await agent.post(`/api/training-sessions/${session.body.id}/notify`);
    expect(res.status).toBe(503);
    process.env.VAPID_PUBLIC_KEY = "test-public-key";
    process.env.VAPID_PRIVATE_KEY = "test-private-key";
  });
});
