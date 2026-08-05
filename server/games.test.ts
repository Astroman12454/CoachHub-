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

// Signs up a fresh account (default team + free plan), and upgrades it to
// paid directly so tests aren't blocked by the AI-import plan gate unless
// they're specifically testing that gate.
async function signedInPaidAgent(app: express.Express) {
  const email = uniqueEmail();
  const agent = request.agent(app);
  await agent.post("/api/signup").send({ email, password: PASSWORD });
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("UPDATE accounts SET plan = 'paid' WHERE email = $1", [email]);
  await pool.end();
  return agent;
}

describe("games", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("creates a game with no stats and lists it", async () => {
    const agent = await signedInPaidAgent(app);

    const create = await agent.post("/api/games").send({
      opponent: "Central High",
      date: "2026-08-01",
      teamScore: 58,
      opponentScore: 52,
    });
    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({ opponent: "Central High", teamScore: 58, opponentScore: 52 });

    const list = await agent.get("/api/games");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  it("creates a game with a box score for a real roster player, and drops stat lines for players outside the team", async () => {
    const agent = await signedInPaidAgent(app);

    const player = await agent.post("/api/players").send({ name: "Test Player", position: "Center", isActive: 1 });
    const foreignPlayerId = player.body.id + 999999; // not on this team's roster

    const create = await agent.post("/api/games").send({
      opponent: "Riverside",
      date: "2026-08-02",
      teamScore: 40,
      opponentScore: 38,
      stats: [
        { playerId: player.body.id, points: 12, rebounds: 5, assists: 2, steals: 1, blocks: 0, turnovers: 1, fouls: 2 },
        { playerId: foreignPlayerId, points: 99, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0 },
      ],
    });
    expect(create.status).toBe(201);

    const detail = await agent.get(`/api/games/${create.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.stats).toHaveLength(1);
    expect(detail.body.stats[0]).toMatchObject({ playerId: player.body.id, points: 12 });
  });

  it("deletes a game", async () => {
    const agent = await signedInPaidAgent(app);
    const create = await agent.post("/api/games").send({ opponent: "Eastside", date: "2026-08-03" });

    const del = await agent.delete(`/api/games/${create.body.id}`);
    expect(del.status).toBe(204);

    const detail = await agent.get(`/api/games/${create.body.id}`);
    expect(detail.status).toBe(404);
  });

  it("scopes games to the requesting team — another account can't see or delete them", async () => {
    const ownerAgent = await signedInPaidAgent(app);
    const create = await ownerAgent.post("/api/games").send({ opponent: "Northside", date: "2026-08-04" });

    const otherAgent = await signedInPaidAgent(app);
    const detail = await otherAgent.get(`/api/games/${create.body.id}`);
    expect(detail.status).toBe(404);

    const del = await otherAgent.delete(`/api/games/${create.body.id}`);
    expect(del.status).toBe(404);
  });

  it("rejects box-score import on the free plan", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/api/signup").send({ email, password: PASSWORD });

    const res = await agent.post("/api/games/analyze").attach("file", Buffer.from("not a real image"), "test.png");
    expect(res.status).toBe(403);
  });

  it("returns 503 when AI import isn't configured (no ANTHROPIC_API_KEY in this environment)", async () => {
    const agent = await signedInPaidAgent(app);
    const res = await agent.post("/api/games/analyze").attach("file", Buffer.from("not a real image"), "test.png");
    expect(res.status).toBe(503);
  });
});
