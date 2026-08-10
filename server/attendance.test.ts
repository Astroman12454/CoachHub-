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

describe("attendance — reason notes", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("sets a reason on an absence and can clear it back to null", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Sam" });
    const session = await agent.post("/api/training-sessions").send({
      name: "Practice", date: "2026-09-01", time: "17:00", duration: 60,
    });
    const attendance = await agent.post("/api/attendance").send({
      sessionId: session.body.id, playerId: player.body.id, status: "absent",
    });

    const withReason = await agent.put(`/api/attendance/${attendance.body.id}`).send({ notes: "Sick" });
    expect(withReason.status).toBe(200);
    expect(withReason.body.notes).toBe("Sick");

    const cleared = await agent.put(`/api/attendance/${attendance.body.id}`).send({ notes: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.notes).toBeNull();
  });
});

describe("attendance stats — hours trained and monthly breakdown", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("returns zeroed/empty stats for a player with no attendance yet", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Sam" });

    const stats = await agent.get(`/api/players/${player.body.id}/attendance-stats`);
    expect(stats.status).toBe(200);
    expect(stats.body).toMatchObject({ total: 0, present: 0, absent: 0, rate: 0, totalHoursTrained: 0, monthly: [] });
  });

  it("sums hours trained from present/late sessions only, and groups by month", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Sam" });

    const sessionA = await agent.post("/api/training-sessions").send({
      name: "Practice A", date: "2026-09-01", time: "17:00", duration: 90,
    });
    const sessionB = await agent.post("/api/training-sessions").send({
      name: "Practice B", date: "2026-09-08", time: "17:00", duration: 60,
    });
    const sessionC = await agent.post("/api/training-sessions").send({
      name: "Practice C", date: "2026-10-01", time: "17:00", duration: 90,
    });

    await agent.post("/api/attendance").send({ sessionId: sessionA.body.id, playerId: player.body.id, status: "present" });
    await agent.post("/api/attendance").send({ sessionId: sessionB.body.id, playerId: player.body.id, status: "absent" });
    await agent.post("/api/attendance").send({ sessionId: sessionC.body.id, playerId: player.body.id, status: "late" });

    const stats = await agent.get(`/api/players/${player.body.id}/attendance-stats`);
    expect(stats.status).toBe(200);
    expect(stats.body.total).toBe(3);
    expect(stats.body.present).toBe(2); // present + late
    expect(stats.body.absent).toBe(1);
    // (90 + 90) minutes of attended sessions = 3.0 hours; the absent 60-minute session doesn't count
    expect(stats.body.totalHoursTrained).toBe(3);
    expect(stats.body.monthly).toEqual([
      { month: "2026-09", present: 1, absent: 1 },
      { month: "2026-10", present: 1, absent: 0 },
    ]);
  });
});
