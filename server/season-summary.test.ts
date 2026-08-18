// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
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

describe("shareable season summary", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("404s on an unknown token", async () => {
    const res = await request(app).get("/api/portal/does-not-exist/summary");
    expect(res.status).toBe(404);
  });

  it("404s once the link is revoked, same as the main portal", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Drew" });
    const link = await agent.post(`/api/players/${player.body.id}/portal-link`);

    await agent.delete(`/api/players/${player.body.id}/portal-link`);
    const res = await request(app).get(`/api/portal/${link.body.token}/summary`);
    expect(res.status).toBe(404);
  });

  it("reports attendance rate/hours, game stats, and the top evaluation scores", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Morgan", position: "Forward", jerseyNumber: 7 });
    const playerId = player.body.id;

    const session = await agent.post("/api/training-sessions").send({
      name: "Conditioning", date: "2026-01-05", time: "18:00", duration: 90,
    });
    await agent.post("/api/attendance").send({ sessionId: session.body.id, playerId, status: "present" });

    await agent.post("/api/games").send({
      opponent: "Rivals", date: "2026-01-10",
      stats: [{ playerId, points: 18, rebounds: 6, assists: 4 }],
    });

    const test = await agent.post("/api/evaluation-tests").send({
      name: "Free Throws", type: "count", unit: "makes", worstValue: 0, bestValue: 10,
    });
    await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
      date: "2026-01-05", results: [{ playerId, value: 9 }],
    });

    const link = await agent.post(`/api/players/${playerId}/portal-link`);
    const res = await request(app).get(`/api/portal/${link.body.token}/summary`);

    expect(res.status).toBe(200);
    expect(res.body.player).toMatchObject({ name: "Morgan", position: "Forward", jerseyNumber: 7 });
    expect(res.body.attendance).toMatchObject({ total: 1, present: 1, rate: 100, totalHoursTrained: 1.5 });
    expect(res.body.gameStats).toMatchObject({ gamesPlayed: 1, points: 18, rebounds: 6, assists: 4 });
    expect(res.body.evaluationHighlights).toHaveLength(1);
    expect(res.body.evaluationHighlights[0]).toMatchObject({ testName: "Free Throws", value: 9 });
    expect(res.body.evaluationHighlights[0].score).toBeGreaterThan(80);
  });

  it("doesn't require a session — a fully anonymous request works", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Jamie" });
    const link = await agent.post(`/api/players/${player.body.id}/portal-link`);

    const res = await request(app).get(`/api/portal/${link.body.token}/summary`);
    expect(res.status).toBe(200);
    expect(res.body.evaluationHighlights).toEqual([]);
    expect(res.body.gameStats).toBeNull();
  });
});
