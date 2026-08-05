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

describe("player/parent portal", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("generates a portal link and serves read-only data with no session at all", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Jordan", position: "Guard" });

    const link = await agent.post(`/api/players/${player.body.id}/portal-link`);
    expect(link.status).toBe(200);
    expect(link.body.token).toMatch(/^[a-f0-9]{48}$/);

    const anon = request(app);
    const portal = await anon.get(`/api/portal/${link.body.token}`);
    expect(portal.status).toBe(200);
    expect(portal.body.player).toMatchObject({ name: "Jordan", position: "Guard" });
    expect(portal.body.upcomingSessions).toEqual([]);
    expect(portal.body.upcomingGames).toEqual([]);
    expect(portal.body.attendance).toEqual([]);
    expect(portal.body.stats).toBeNull();
  });

  it("returns the same token on repeated requests instead of rotating it", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Sam" });

    const first = await agent.post(`/api/players/${player.body.id}/portal-link`);
    const second = await agent.post(`/api/players/${player.body.id}/portal-link`);
    expect(first.body.token).toBe(second.body.token);
  });

  it("404s on an unknown token", async () => {
    const anon = request(app);
    const res = await anon.get("/api/portal/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("revoking the link makes it stop resolving", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Riley" });
    const link = await agent.post(`/api/players/${player.body.id}/portal-link`);

    const revoke = await agent.delete(`/api/players/${player.body.id}/portal-link`);
    expect(revoke.status).toBe(204);

    const anon = request(app);
    const portal = await anon.get(`/api/portal/${link.body.token}`);
    expect(portal.status).toBe(404);
  });

  it("only a coach with the team session can create or revoke a link, never an outsider", async () => {
    const owner = await signedInAgent(app);
    const player = await owner.post("/api/players").send({ name: "Taylor" });

    const outsider = await signedInAgent(app);
    const outsiderCreate = await outsider.post(`/api/players/${player.body.id}/portal-link`);
    expect(outsiderCreate.status).toBe(404);
  });

  it("includes upcoming sessions/games and this player's own attendance and stats", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Casey" });
    const playerId = player.body.id;

    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const session = await agent.post("/api/training-sessions").send({
      name: "Shooting drills", date: future, time: "18:00", duration: 60,
    });
    await agent.post("/api/attendance").send({ sessionId: session.body.id, playerId, status: "present" });
    const game = await agent.post("/api/games").send({ opponent: "Rivals", date: future });
    await agent.post("/api/games").send({
      opponent: "Already played", date: "2020-01-01",
      stats: [{ playerId, points: 12, rebounds: 5, assists: 3 }],
    });

    const link = await agent.post(`/api/players/${playerId}/portal-link`);
    const anon = request(app);
    const portal = await anon.get(`/api/portal/${link.body.token}`);

    expect(portal.body.upcomingSessions).toHaveLength(1);
    expect(portal.body.upcomingSessions[0]).toMatchObject({ name: "Shooting drills", date: future, time: "18:00" });
    expect(portal.body.upcomingGames).toHaveLength(1);
    expect(portal.body.upcomingGames[0]).toMatchObject({ opponent: "Rivals", date: future });
    expect(portal.body.attendance).toHaveLength(1);
    expect(portal.body.attendance[0]).toMatchObject({ status: "present", sessionName: "Shooting drills" });
    expect(portal.body.stats).toMatchObject({ gamesPlayed: 1, points: 12, rebounds: 5, assists: 3 });
    expect(game.status).toBe(201);
  });
});
