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

describe("teams — default session duration", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("sets and clears a team's default session duration", async () => {
    const agent = await signedInAgent(app);
    const teams = await agent.get("/api/teams");
    const teamId = teams.body[0].id;

    const set = await agent.put(`/api/teams/${teamId}`).send({ defaultSessionDuration: 90 });
    expect(set.status).toBe(200);
    expect(set.body.defaultSessionDuration).toBe(90);

    const cleared = await agent.put(`/api/teams/${teamId}`).send({ defaultSessionDuration: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.defaultSessionDuration).toBeNull();
  });

  it("rejects a duration below 1 minute", async () => {
    const agent = await signedInAgent(app);
    const teams = await agent.get("/api/teams");
    const teamId = teams.body[0].id;

    const res = await agent.put(`/api/teams/${teamId}`).send({ defaultSessionDuration: 0 });
    expect(res.status).toBe(400);
  });

  it("404s when updating a team belonging to a different account", async () => {
    const owner = await signedInAgent(app);
    const ownerTeams = await owner.get("/api/teams");
    const ownerTeamId = ownerTeams.body[0].id;

    const outsider = await signedInAgent(app);
    const res = await outsider.put(`/api/teams/${ownerTeamId}`).send({ defaultSessionDuration: 90 });
    expect(res.status).toBe(404);
  });
});

describe("teams — logo and theme color", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("sets and clears a team's logo URL", async () => {
    const agent = await signedInAgent(app);
    const teams = await agent.get("/api/teams");
    const teamId = teams.body[0].id;

    const set = await agent.put(`/api/teams/${teamId}`).send({ logoUrl: "https://example.com/logo.png" });
    expect(set.status).toBe(200);
    expect(set.body.logoUrl).toBe("https://example.com/logo.png");

    const cleared = await agent.put(`/api/teams/${teamId}`).send({ logoUrl: null });
    expect(cleared.body.logoUrl).toBeNull();
  });

  it("sets and clears a team's theme color from the known preset list", async () => {
    const agent = await signedInAgent(app);
    const teams = await agent.get("/api/teams");
    const teamId = teams.body[0].id;

    const set = await agent.put(`/api/teams/${teamId}`).send({ themeColor: "blue" });
    expect(set.status).toBe(200);
    expect(set.body.themeColor).toBe("blue");

    const cleared = await agent.put(`/api/teams/${teamId}`).send({ themeColor: null });
    expect(cleared.body.themeColor).toBeNull();
  });

  it("rejects a theme color outside the known preset list", async () => {
    const agent = await signedInAgent(app);
    const teams = await agent.get("/api/teams");
    const teamId = teams.body[0].id;

    const res = await agent.put(`/api/teams/${teamId}`).send({ themeColor: "chartreuse" });
    expect(res.status).toBe(400);
  });
});

describe("teams — data export", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("bundles the team's roster, schedule, attendance, games, plays, and evaluation-test history", async () => {
    const agent = await signedInAgent(app);
    const teams = await agent.get("/api/teams");
    const teamId = teams.body[0].id;
    await agent.put(`/api/teams/${teamId}`).send({ logoUrl: "https://example.com/logo.png", themeColor: "green" });

    const player = await agent.post("/api/players").send({ name: "Jordan" });
    const session = await agent.post("/api/training-sessions").send({
      name: "Shooting drills", date: "2026-08-05", time: "18:00", duration: 60,
    });
    await agent.post("/api/attendance").send({ sessionId: session.body.id, playerId: player.body.id, status: "present" });
    const game = await agent.post("/api/games").send({
      opponent: "Central High", date: "2026-08-06", teamScore: 58, opponentScore: 52,
      stats: [{ playerId: player.body.id, points: 12 }],
    });
    const test = await agent.post("/api/evaluation-tests").send({ name: "Sprint", type: "time", unit: "seconds", worstValue: 15, bestValue: 5 });
    await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
      date: "2026-08-01", results: [{ playerId: player.body.id, value: 9.8 }],
    });
    const play = await agent.post("/api/plays").send({
      name: "Horns Flare", category: "offense", courtType: "half",
      steps: [{ tokens: [{ id: "o1", type: "offense", label: "1", x: 50, y: 90 }], drawings: [] }],
    });

    const res = await agent.get(`/api/teams/${teamId}/export`);
    expect(res.status).toBe(200);
    expect(res.body.team).toMatchObject({ logoUrl: "https://example.com/logo.png", themeColor: "green" });
    expect(res.body.players).toHaveLength(1);
    expect(res.body.players[0]).toMatchObject({ name: "Jordan" });
    expect(res.body.trainingSessions).toHaveLength(1);
    expect(res.body.attendance).toHaveLength(1);
    expect(res.body.attendance[0]).toMatchObject({ sessionId: session.body.id, status: "present" });
    expect(res.body.games).toHaveLength(1);
    expect(res.body.games[0]).toMatchObject({ opponent: "Central High" });
    expect(res.body.games[0].stats).toHaveLength(1);
    expect(res.body.games[0].stats[0]).toMatchObject({ points: 12 });
    expect(res.body.plays).toHaveLength(1);
    expect(res.body.plays[0]).toMatchObject({ name: "Horns Flare" });
    expect(res.body.plays[0].steps).toHaveLength(1);
    expect(res.body.evaluationTests).toHaveLength(1);
    expect(res.body.evaluationTestHistory).toHaveLength(1);
    expect(res.body.evaluationTestHistory[0]).toMatchObject({ playerId: player.body.id, playerName: "Jordan" });
    expect(res.body.evaluationTestHistory[0].history[0]).toMatchObject({ testName: "Sprint", results: [{ value: 9.8, date: "2026-08-01" }] });
    expect(typeof res.body.exportedAt).toBe("string");
  });

  it("404s when exporting a team belonging to a different account", async () => {
    const owner = await signedInAgent(app);
    const ownerTeams = await owner.get("/api/teams");
    const ownerTeamId = ownerTeams.body[0].id;

    const outsider = await signedInAgent(app);
    const res = await outsider.get(`/api/teams/${ownerTeamId}/export`);
    expect(res.status).toBe(404);
  });
});
