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

function onePlay(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Horns Flare",
    category: "offense",
    courtType: "half",
    steps: [
      {
        tokens: [{ id: "o1", type: "offense", label: "1", x: 50, y: 90 }],
        drawings: [],
      },
    ],
    ...overrides,
  };
}

function oneSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Practice",
    date: "2026-09-01",
    time: "18:00",
    duration: 60,
    ...overrides,
  };
}

describe("play practice stats", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("reports no stats for a play that's never been attached to a session", async () => {
    const agent = await signedInPaidAgent(app);
    await agent.post("/api/plays").send(onePlay());

    const stats = await agent.get("/api/plays/stats");
    expect(stats.status).toBe(200);
    expect(stats.body).toEqual([]);
  });

  it("counts a play as practiced once a session references it, and tracks the date", async () => {
    const agent = await signedInPaidAgent(app);
    const play = await agent.post("/api/plays").send(onePlay());

    const session = await agent.post("/api/training-sessions").send(
      oneSession({ playIds: [play.body.id.toString()] }),
    );
    expect(session.status).toBe(201);
    expect(session.body.playIds).toEqual([play.body.id.toString()]);

    const stats = await agent.get("/api/plays/stats");
    expect(stats.body).toEqual([
      { playId: play.body.id, timesPracticed: 1, lastPracticedDate: "2026-09-01" },
    ]);
  });

  it("accumulates across multiple sessions and keeps the most recent date", async () => {
    const agent = await signedInPaidAgent(app);
    const play = await agent.post("/api/plays").send(onePlay());
    const playId = play.body.id.toString();

    await agent.post("/api/training-sessions").send(oneSession({ date: "2026-09-01", playIds: [playId] }));
    await agent.post("/api/training-sessions").send(oneSession({ date: "2026-08-01", playIds: [playId] }));
    await agent.post("/api/training-sessions").send(oneSession({ date: "2026-09-15", playIds: [playId] }));

    const stats = await agent.get("/api/plays/stats");
    const entry = stats.body.find((s: { playId: number }) => s.playId === play.body.id);
    expect(entry.timesPracticed).toBe(3);
    expect(entry.lastPracticedDate).toBe("2026-09-15");
  });

  it("updates practice counts when a session's plays are edited", async () => {
    const agent = await signedInPaidAgent(app);
    const playA = await agent.post("/api/plays").send(onePlay({ name: "Play A" }));
    const playB = await agent.post("/api/plays").send(onePlay({ name: "Play B" }));

    const session = await agent.post("/api/training-sessions").send(
      oneSession({ playIds: [playA.body.id.toString()] }),
    );
    await agent.put(`/api/training-sessions/${session.body.id}`).send({
      playIds: [playB.body.id.toString()],
    });

    const stats = await agent.get("/api/plays/stats");
    const statsById = new Map(stats.body.map((s: { playId: number; timesPracticed: number }) => [s.playId, s.timesPracticed]));
    expect(statsById.get(playA.body.id)).toBeUndefined();
    expect(statsById.get(playB.body.id)).toBe(1);
  });

  it("strips a playId that doesn't belong to the requesting team", async () => {
    const owner = await signedInPaidAgent(app);
    const outsidersPlay = await owner.post("/api/plays").send(onePlay());

    const otherCoach = await signedInPaidAgent(app);
    const session = await otherCoach.post("/api/training-sessions").send(
      oneSession({ playIds: [outsidersPlay.body.id.toString()] }),
    );
    expect(session.status).toBe(201);
    expect(session.body.playIds).toEqual([]);
  });

  it("scopes /api/plays/stats to the requesting team's own sessions", async () => {
    const teamA = await signedInPaidAgent(app);
    const playA = await teamA.post("/api/plays").send(onePlay());
    await teamA.post("/api/training-sessions").send(oneSession({ playIds: [playA.body.id.toString()] }));

    const teamB = await signedInPaidAgent(app);
    const statsForB = await teamB.get("/api/plays/stats");
    expect(statsForB.body).toEqual([]);
  });
});
