// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { Pool } from "pg";
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
  return { agent, email };
}

async function setPlan(email: string, plan: "free" | "paid" | "club") {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("UPDATE accounts SET plan = $1 WHERE email = $2", [plan, email]);
  await pool.end();
}

function sprintTest(overrides: Partial<Record<string, unknown>> = {}) {
  return { name: "Sprint 3x Court", unit: "seconds", lowerIsBetter: 1, description: "3 sprints across the court", ...overrides };
}

describe("physical tests", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("is available on the free plan — no plan gate, unlike custom exercises", async () => {
    const { agent } = await signedInAgent(app);
    const res = await agent.post("/api/physical-tests").send(sprintTest());
    expect(res.status).toBe(201);
  });

  it("creates a test and lists it", async () => {
    const { agent } = await signedInAgent(app);
    const create = await agent.post("/api/physical-tests").send(sprintTest());
    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({ name: "Sprint 3x Court", unit: "seconds", lowerIsBetter: 1 });

    const list = await agent.get("/api/physical-tests");
    expect(list.status).toBe(200);
    expect(list.body.some((t: { id: number }) => t.id === create.body.id)).toBe(true);
  });

  it("rejects a test with no name or unit", async () => {
    const { agent } = await signedInAgent(app);
    const noName = await agent.post("/api/physical-tests").send(sprintTest({ name: "" }));
    expect(noName.status).toBe(400);

    const noUnit = await agent.post("/api/physical-tests").send(sprintTest({ unit: "" }));
    expect(noUnit.status).toBe(400);
  });

  it("updates and deletes a test", async () => {
    const { agent } = await signedInAgent(app);
    const create = await agent.post("/api/physical-tests").send(sprintTest());
    const id = create.body.id;

    const update = await agent.put(`/api/physical-tests/${id}`).send({ name: "Sprint 4x Court" });
    expect(update.status).toBe(200);
    expect(update.body.name).toBe("Sprint 4x Court");

    const del = await agent.delete(`/api/physical-tests/${id}`);
    expect(del.status).toBe(204);

    const afterDelete = await agent.put(`/api/physical-tests/${id}`).send({ name: "Nope" });
    expect(afterDelete.status).toBe(404);
  });

  it("scopes tests to the requesting account — another account can't see, edit, or delete them", async () => {
    const { agent: owner } = await signedInAgent(app);
    const create = await owner.post("/api/physical-tests").send(sprintTest());
    const id = create.body.id;

    const { agent: outsider } = await signedInAgent(app);
    const list = await outsider.get("/api/physical-tests");
    expect(list.body.some((t: { id: number }) => t.id === id)).toBe(false);

    const update = await outsider.put(`/api/physical-tests/${id}`).send({ name: "Hijacked" });
    expect(update.status).toBe(404);

    const del = await outsider.delete(`/api/physical-tests/${id}`);
    expect(del.status).toBe(404);
  });

  describe("recording results", () => {
    it("records results for the whole roster in one batch", async () => {
      const { agent } = await signedInAgent(app);
      const test = await agent.post("/api/physical-tests").send(sprintTest());
      const playerA = await agent.post("/api/players").send({ name: "Riley" });
      const playerB = await agent.post("/api/players").send({ name: "Sam" });

      const res = await agent.post(`/api/physical-tests/${test.body.id}/results`).send({
        date: "2026-08-01",
        results: [
          { playerId: playerA.body.id, value: 9.8 },
          { playerId: playerB.body.id, value: 10.4 },
        ],
      });
      expect(res.status).toBe(201);
      expect(res.body).toHaveLength(2);
    });

    it("rejects a batch containing a player from a different team", async () => {
      const { agent: owner } = await signedInAgent(app);
      const test = await owner.post("/api/physical-tests").send(sprintTest());
      const ownPlayer = await owner.post("/api/players").send({ name: "Owner's Player" });

      const { agent: outsider } = await signedInAgent(app);
      const outsidersPlayer = await outsider.post("/api/players").send({ name: "Outsider's Player" });

      const res = await owner.post(`/api/physical-tests/${test.body.id}/results`).send({
        date: "2026-08-01",
        results: [
          { playerId: ownPlayer.body.id, value: 9.8 },
          { playerId: outsidersPlayer.body.id, value: 9.5 },
        ],
      });
      expect(res.status).toBe(400);
    });

    it("404s recording results against a test that doesn't belong to the account", async () => {
      const { agent: owner } = await signedInAgent(app);
      const test = await owner.post("/api/physical-tests").send(sprintTest());
      const player = await owner.post("/api/players").send({ name: "Riley" });

      const { agent: outsider } = await signedInAgent(app);
      await outsider.post("/api/players").send({ name: "Doesn't matter" });
      const res = await outsider.post(`/api/physical-tests/${test.body.id}/results`).send({
        date: "2026-08-01",
        results: [{ playerId: player.body.id, value: 9.8 }],
      });
      expect(res.status).toBe(404);
    });

    it("returns each player's latest result for the current team, for prefilling the entry form", async () => {
      const { agent } = await signedInAgent(app);
      const test = await agent.post("/api/physical-tests").send(sprintTest());
      const player = await agent.post("/api/players").send({ name: "Riley" });

      await agent.post(`/api/physical-tests/${test.body.id}/results`).send({
        date: "2026-07-01",
        results: [{ playerId: player.body.id, value: 10.5 }],
      });
      await agent.post(`/api/physical-tests/${test.body.id}/results`).send({
        date: "2026-08-01",
        results: [{ playerId: player.body.id, value: 9.8 }],
      });

      const latest = await agent.get(`/api/physical-tests/${test.body.id}/latest`);
      expect(latest.status).toBe(200);
      expect(latest.body[player.body.id]).toMatchObject({ value: 9.8, date: "2026-08-01" });
    });
  });

  describe("GET /api/players/:id/physical-test-results", () => {
    it("returns a player's history grouped by test, newest-first, with unit and direction", async () => {
      const { agent } = await signedInAgent(app);
      const test = await agent.post("/api/physical-tests").send(sprintTest());
      const player = await agent.post("/api/players").send({ name: "Riley" });

      await agent.post(`/api/physical-tests/${test.body.id}/results`).send({
        date: "2026-07-01",
        results: [{ playerId: player.body.id, value: 10.5 }],
      });
      await agent.post(`/api/physical-tests/${test.body.id}/results`).send({
        date: "2026-08-01",
        results: [{ playerId: player.body.id, value: 9.8 }],
      });

      const res = await agent.get(`/api/players/${player.body.id}/physical-test-results`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ testName: "Sprint 3x Court", unit: "seconds", lowerIsBetter: true });
      expect(res.body[0].results).toEqual([
        { value: 9.8, date: "2026-08-01" },
        { value: 10.5, date: "2026-07-01" },
      ]);
    });

    it("404s for a player outside the requesting team", async () => {
      const { agent: owner } = await signedInAgent(app);
      const player = await owner.post("/api/players").send({ name: "Riley" });

      const { agent: outsider } = await signedInAgent(app);
      const res = await outsider.get(`/api/players/${player.body.id}/physical-test-results`);
      expect(res.status).toBe(404);
    });
  });

  it("a Club coach shares the account owner's test library and can record results against it", async () => {
    const { agent: ownerAgent, email: ownerEmail } = await signedInAgent(app);
    await setPlan(ownerEmail, "club");
    const test = await ownerAgent.post("/api/physical-tests").send(sprintTest());
    const player = await ownerAgent.post("/api/players").send({ name: "Riley" });

    const { agent: coachAgent, email: coachEmail } = await signedInAgent(app);
    const invite = await ownerAgent.post("/api/coaches/invite").send({ email: coachEmail });
    expect(invite.status).toBe(201);

    // The invite email is never actually sent in this test env (RESEND_* is
    // unset), so accept directly against the DB-stored hash isn't possible
    // from here — instead verify sharing works purely via
    // resolveEffectiveAccountId by checking the coach can already see and
    // use the owner's test once the membership exists. Insert the
    // membership row directly since there's no token to accept with here.
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const ownerAccount = await pool.query("SELECT id FROM accounts WHERE email = $1", [ownerEmail]);
    const coachAccount = await pool.query("SELECT id FROM accounts WHERE email = $1", [coachEmail]);
    await pool.query("INSERT INTO account_memberships (owner_account_id, member_account_id) VALUES ($1, $2)", [
      ownerAccount.rows[0].id,
      coachAccount.rows[0].id,
    ]);
    await pool.end();

    const list = await coachAgent.get("/api/physical-tests");
    expect(list.body.some((t: { id: number }) => t.id === test.body.id)).toBe(true);

    // The coach needs the owner's team selected to record results — switch
    // to it the same way the client does after accepting an invite.
    const session = await coachAgent.get("/api/session");
    const ownerTeamId = session.body.teams[0].id;
    await coachAgent.put("/api/session/team").send({ teamId: ownerTeamId });

    const record = await coachAgent.post(`/api/physical-tests/${test.body.id}/results`).send({
      date: "2026-08-01",
      results: [{ playerId: player.body.id, value: 9.8 }],
    });
    expect(record.status).toBe(201);
  });
});
