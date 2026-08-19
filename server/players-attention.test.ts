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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("GET /api/players/attention", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("is empty for a team with no injuries at all", async () => {
    const agent = await signedInAgent(app);
    const res = await agent.get("/api/players/attention");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("flags a player with an active injury marked present in the last 7 days", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Riley" });
    await agent.post(`/api/players/${player.body.id}/injuries`).send({
      description: "Twisted ankle", reportedDate: todayISO(),
    });
    const session = await agent.post("/api/training-sessions").send({
      name: "Practice", date: todayISO(), time: "18:00", duration: 60,
    });
    await agent.post("/api/attendance").send({ sessionId: session.body.id, playerId: player.body.id, status: "present" });

    const res = await agent.get("/api/players/attention");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      playerName: "Riley",
      reason: "active_injury_recent_attendance",
      injuryDescription: "Twisted ankle",
      lastPresentDate: todayISO(),
    });
  });

  it("doesn't flag a player marked absent, only present/late", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Casey" });
    await agent.post(`/api/players/${player.body.id}/injuries`).send({
      description: "Sore knee", reportedDate: todayISO(),
    });
    const session = await agent.post("/api/training-sessions").send({
      name: "Practice", date: todayISO(), time: "18:00", duration: 60,
    });
    await agent.post("/api/attendance").send({ sessionId: session.body.id, playerId: player.body.id, status: "absent" });

    const res = await agent.get("/api/players/attention");
    expect(res.body).toEqual([]);
  });

  it("doesn't flag a recovered injury even with recent attendance", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Jordan" });
    const injury = await agent.post(`/api/players/${player.body.id}/injuries`).send({
      description: "Bruised shin", reportedDate: todayISO(),
    });
    await agent.put(`/api/players/${player.body.id}/injuries/${injury.body.id}/recover`).send({ recoveredDate: todayISO() });
    const session = await agent.post("/api/training-sessions").send({
      name: "Practice", date: todayISO(), time: "18:00", duration: 60,
    });
    await agent.post("/api/attendance").send({ sessionId: session.body.id, playerId: player.body.id, status: "present" });

    const res = await agent.get("/api/players/attention");
    expect(res.body).toEqual([]);
  });

  it("doesn't flag attendance older than 7 days", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Morgan" });
    await agent.post(`/api/players/${player.body.id}/injuries`).send({
      description: "Wrist strain", reportedDate: todayISO(),
    });
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);
    const session = await agent.post("/api/training-sessions").send({
      name: "Practice", date: oldDate.toISOString().slice(0, 10), time: "18:00", duration: 60,
    });
    await agent.post("/api/attendance").send({ sessionId: session.body.id, playerId: player.body.id, status: "present" });

    const res = await agent.get("/api/players/attention");
    expect(res.body).toEqual([]);
  });
});
