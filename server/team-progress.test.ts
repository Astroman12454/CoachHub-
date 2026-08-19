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

// Mirrors storage.ts's own mondayOf so fixtures land in the exact week
// buckets getTeamProgressSummary groups by.
function mondayOf(date: Date): Date {
  const d = new Date(date);
  const isoDay = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - isoDay);
  return d;
}
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function weeksAgo(n: number): Date {
  const d = mondayOf(new Date());
  d.setDate(d.getDate() - n * 7);
  return d;
}

async function completedSessionOn(agent: request.Agent, playerId: number, date: Date) {
  const res = await agent.post("/api/training-sessions").send({
    name: "Practice", date: toDateStr(date), time: "18:00", duration: 60,
  });
  await agent.post("/api/attendance").send({ sessionId: res.body.id, playerId, status: "present" });
  await agent.put(`/api/training-sessions/${res.body.id}`).send({ status: "completed" });
  return res.body.id;
}

describe("GET /api/team-progress", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("is all zero/null for a team with no completed sessions", async () => {
    const agent = await signedInAgent(app);
    const res = await agent.get("/api/team-progress");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ streakWeeks: 0, attendanceRateThisMonth: null, attendanceRateLastMonth: null });
  });

  it("counts a run of consecutive weeks, not counting the current week against it if it's empty", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Devon" });
    const playerId = player.body.id;

    // Last week, 2 weeks ago, 3 weeks ago — three in a row, nothing this week yet.
    await completedSessionOn(agent, playerId, weeksAgo(1));
    await completedSessionOn(agent, playerId, weeksAgo(2));
    await completedSessionOn(agent, playerId, weeksAgo(3));

    const res = await agent.get("/api/team-progress");
    expect(res.body.streakWeeks).toBe(3);
  });

  it("stops the streak at a gap instead of counting an isolated older week", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Priya" });
    const playerId = player.body.id;

    await completedSessionOn(agent, playerId, weeksAgo(1));
    await completedSessionOn(agent, playerId, weeksAgo(2));
    // weeksAgo(3) deliberately skipped — a gap.
    await completedSessionOn(agent, playerId, weeksAgo(4));

    const res = await agent.get("/api/team-progress");
    expect(res.body.streakWeeks).toBe(2);
  });

  it("a session still in the current (unfinished) week doesn't reset an otherwise-broken streak check", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Sam" });
    const playerId = player.body.id;

    await completedSessionOn(agent, playerId, weeksAgo(0));
    await completedSessionOn(agent, playerId, weeksAgo(1));

    const res = await agent.get("/api/team-progress");
    expect(res.body.streakWeeks).toBe(2);
  });

  it("computes team-wide attendance rate for this month vs last month", async () => {
    const agent = await signedInAgent(app);
    const p1 = await agent.post("/api/players").send({ name: "A" });
    const p2 = await agent.post("/api/players").send({ name: "B" });

    // This month: 1 of 2 active players present → 50%.
    const thisMonthSession = await agent.post("/api/training-sessions").send({
      name: "Practice", date: toDateStr(new Date()), time: "18:00", duration: 60,
    });
    await agent.post("/api/attendance").send({ sessionId: thisMonthSession.body.id, playerId: p1.body.id, status: "present" });
    await agent.put(`/api/training-sessions/${thisMonthSession.body.id}`).send({ status: "completed" });

    // Last month: both players present → 100%.
    const lastMonthDate = new Date();
    lastMonthDate.setMonth(lastMonthDate.getMonth() - 1, 15);
    const lastMonthSession = await agent.post("/api/training-sessions").send({
      name: "Practice", date: toDateStr(lastMonthDate), time: "18:00", duration: 60,
    });
    await agent.post("/api/attendance").send({ sessionId: lastMonthSession.body.id, playerId: p1.body.id, status: "present" });
    await agent.post("/api/attendance").send({ sessionId: lastMonthSession.body.id, playerId: p2.body.id, status: "present" });
    await agent.put(`/api/training-sessions/${lastMonthSession.body.id}`).send({ status: "completed" });

    const res = await agent.get("/api/team-progress");
    expect(res.body.attendanceRateThisMonth).toBe(50);
    expect(res.body.attendanceRateLastMonth).toBe(100);
  });

  it("only counts completed sessions toward the streak, not scheduled/cancelled ones", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Robin" });
    const playerId = player.body.id;
    await agent.post("/api/training-sessions").send({
      name: "Not run yet", date: toDateStr(weeksAgo(1)), time: "18:00", duration: 60,
    });
    void playerId;

    const res = await agent.get("/api/team-progress");
    expect(res.body.streakWeeks).toBe(0);
  });
});
