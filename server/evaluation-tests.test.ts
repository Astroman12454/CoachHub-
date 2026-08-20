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

// A timed test: worstValue > bestValue (slower = worse, faster = better).
function sprintTest(overrides: Partial<Record<string, unknown>> = {}) {
  return { name: "Sprint 3x Court", type: "time", unit: "seconds", worstValue: 15, bestValue: 5, description: "3 sprints across the court", ...overrides };
}

describe("evaluation tests", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("is available on the free plan — no plan gate, unlike custom exercises", async () => {
    const { agent } = await signedInAgent(app);
    const res = await agent.post("/api/evaluation-tests").send(sprintTest());
    expect(res.status).toBe(201);
  });

  it("creates a test and lists it", async () => {
    const { agent } = await signedInAgent(app);
    const create = await agent.post("/api/evaluation-tests").send(sprintTest());
    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({ name: "Sprint 3x Court", type: "time", unit: "seconds", worstValue: 15, bestValue: 5 });

    const list = await agent.get("/api/evaluation-tests");
    expect(list.status).toBe(200);
    expect(list.body.some((t: { id: number }) => t.id === create.body.id)).toBe(true);
  });

  it("rejects a test with no name or unit", async () => {
    const { agent } = await signedInAgent(app);
    const noName = await agent.post("/api/evaluation-tests").send(sprintTest({ name: "" }));
    expect(noName.status).toBe(400);

    const noUnit = await agent.post("/api/evaluation-tests").send(sprintTest({ unit: "" }));
    expect(noUnit.status).toBe(400);
  });

  it("rejects a test whose worst and best reference values are equal", async () => {
    const { agent } = await signedInAgent(app);
    const res = await agent.post("/api/evaluation-tests").send(sprintTest({ worstValue: 10, bestValue: 10 }));
    expect(res.status).toBe(400);
  });

  it("updates and deletes a test", async () => {
    const { agent } = await signedInAgent(app);
    const create = await agent.post("/api/evaluation-tests").send(sprintTest());
    const id = create.body.id;

    const update = await agent.put(`/api/evaluation-tests/${id}`).send({ name: "Sprint 4x Court" });
    expect(update.status).toBe(200);
    expect(update.body.name).toBe("Sprint 4x Court");

    const del = await agent.delete(`/api/evaluation-tests/${id}`);
    expect(del.status).toBe(204);

    const afterDelete = await agent.put(`/api/evaluation-tests/${id}`).send({ name: "Nope" });
    expect(afterDelete.status).toBe(404);
  });

  it("scopes tests to the requesting account — another account can't see, edit, or delete them", async () => {
    const { agent: owner } = await signedInAgent(app);
    const create = await owner.post("/api/evaluation-tests").send(sprintTest());
    const id = create.body.id;

    const { agent: outsider } = await signedInAgent(app);
    const list = await outsider.get("/api/evaluation-tests");
    expect(list.body.some((t: { id: number }) => t.id === id)).toBe(false);

    const update = await outsider.put(`/api/evaluation-tests/${id}`).send({ name: "Hijacked" });
    expect(update.status).toBe(404);

    const del = await outsider.delete(`/api/evaluation-tests/${id}`);
    expect(del.status).toBe(404);
  });

  describe("recording results", () => {
    it("records results for the whole roster in one batch", async () => {
      const { agent } = await signedInAgent(app);
      const test = await agent.post("/api/evaluation-tests").send(sprintTest());
      const playerA = await agent.post("/api/players").send({ name: "Riley" });
      const playerB = await agent.post("/api/players").send({ name: "Sam" });

      const res = await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-08-01",
        results: [
          { playerId: playerA.body.id, value: 9.8 },
          { playerId: playerB.body.id, value: 10.4 },
        ],
      });
      expect(res.status).toBe(201);
      expect(res.body.results).toHaveLength(2);
      expect(res.body.newRecordPlayerIds).toEqual([]);
    });

    it("a single-entry batch also works — the quick single-player add from the profile", async () => {
      const { agent } = await signedInAgent(app);
      const test = await agent.post("/api/evaluation-tests").send(sprintTest());
      const player = await agent.post("/api/players").send({ name: "Riley" });

      const res = await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-08-01",
        results: [{ playerId: player.body.id, value: 9.8 }],
      });
      expect(res.status).toBe(201);
      expect(res.body.results).toHaveLength(1);
    });

    it("does not flag a player's first-ever result as a new record — there's nothing to beat yet", async () => {
      const { agent } = await signedInAgent(app);
      const test = await agent.post("/api/evaluation-tests").send(sprintTest());
      const player = await agent.post("/api/players").send({ name: "Riley" });

      const res = await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-08-01",
        results: [{ playerId: player.body.id, value: 9.8 }],
      });
      expect(res.body.newRecordPlayerIds).toEqual([]);
    });

    it("flags a new personal record on a timed test (worstValue > bestValue, lower is better)", async () => {
      const { agent } = await signedInAgent(app);
      const test = await agent.post("/api/evaluation-tests").send(sprintTest());
      const player = await agent.post("/api/players").send({ name: "Riley" });

      await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-08-01",
        results: [{ playerId: player.body.id, value: 9.8 }],
      });

      const worse = await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-08-08",
        results: [{ playerId: player.body.id, value: 10.1 }],
      });
      expect(worse.body.newRecordPlayerIds).toEqual([]);

      const faster = await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-08-15",
        results: [{ playerId: player.body.id, value: 9.5 }],
      });
      expect(faster.body.newRecordPlayerIds).toEqual([player.body.id]);
    });

    it("flags a new personal record on a count test (worstValue < bestValue, higher is better)", async () => {
      const { agent } = await signedInAgent(app);
      const test = await agent.post("/api/evaluation-tests").send({ name: "Free Throws", type: "count", unit: "makes", worstValue: 0, bestValue: 20 });
      const player = await agent.post("/api/players").send({ name: "Riley" });

      await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-08-01",
        results: [{ playerId: player.body.id, value: 12 }],
      });

      const worse = await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-08-08",
        results: [{ playerId: player.body.id, value: 10 }],
      });
      expect(worse.body.newRecordPlayerIds).toEqual([]);

      const better = await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-08-15",
        results: [{ playerId: player.body.id, value: 15 }],
      });
      expect(better.body.newRecordPlayerIds).toEqual([player.body.id]);
    });

    it("only flags the players who actually beat their own record in a mixed batch", async () => {
      const { agent } = await signedInAgent(app);
      const test = await agent.post("/api/evaluation-tests").send(sprintTest());
      const playerA = await agent.post("/api/players").send({ name: "Riley" });
      const playerB = await agent.post("/api/players").send({ name: "Sam" });

      await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-08-01",
        results: [
          { playerId: playerA.body.id, value: 9.8 },
          { playerId: playerB.body.id, value: 10.4 },
        ],
      });

      const res = await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-08-08",
        results: [
          { playerId: playerA.body.id, value: 9.2 }, // faster — new record
          { playerId: playerB.body.id, value: 10.9 }, // slower — not a record
        ],
      });
      expect(res.body.newRecordPlayerIds).toEqual([playerA.body.id]);
    });

    it("rejects a batch containing a player from a different team", async () => {
      const { agent: owner } = await signedInAgent(app);
      const test = await owner.post("/api/evaluation-tests").send(sprintTest());
      const ownPlayer = await owner.post("/api/players").send({ name: "Owner's Player" });

      const { agent: outsider } = await signedInAgent(app);
      const outsidersPlayer = await outsider.post("/api/players").send({ name: "Outsider's Player" });

      const res = await owner.post(`/api/evaluation-tests/${test.body.id}/results`).send({
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
      const test = await owner.post("/api/evaluation-tests").send(sprintTest());
      const player = await owner.post("/api/players").send({ name: "Riley" });

      const { agent: outsider } = await signedInAgent(app);
      await outsider.post("/api/players").send({ name: "Doesn't matter" });
      const res = await outsider.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-08-01",
        results: [{ playerId: player.body.id, value: 9.8 }],
      });
      expect(res.status).toBe(404);
    });

    it("returns each player's latest result for the current team, for prefilling the entry form", async () => {
      const { agent } = await signedInAgent(app);
      const test = await agent.post("/api/evaluation-tests").send(sprintTest());
      const player = await agent.post("/api/players").send({ name: "Riley" });

      await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-07-01",
        results: [{ playerId: player.body.id, value: 10.5 }],
      });
      await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-08-01",
        results: [{ playerId: player.body.id, value: 9.8 }],
      });

      const latest = await agent.get(`/api/evaluation-tests/${test.body.id}/latest`);
      expect(latest.status).toBe(200);
      expect(latest.body[player.body.id]).toMatchObject({ value: 9.8, date: "2026-08-01" });
    });
  });

  describe("GET /api/players/:id/evaluation-results", () => {
    it("returns a player's history grouped by test, newest-first, with type/unit/reference range", async () => {
      const { agent } = await signedInAgent(app);
      const test = await agent.post("/api/evaluation-tests").send(sprintTest());
      const player = await agent.post("/api/players").send({ name: "Riley" });

      await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-07-01",
        results: [{ playerId: player.body.id, value: 10.5 }],
      });
      await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-08-01",
        results: [{ playerId: player.body.id, value: 9.8 }],
      });

      const res = await agent.get(`/api/players/${player.body.id}/evaluation-results`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ testName: "Sprint 3x Court", type: "time", unit: "seconds", worstValue: 15, bestValue: 5 });
      expect(res.body[0].results).toEqual([
        { value: 9.8, date: "2026-08-01" },
        { value: 10.5, date: "2026-07-01" },
      ]);
    });

    it("404s for a player outside the requesting team", async () => {
      const { agent: owner } = await signedInAgent(app);
      const player = await owner.post("/api/players").send({ name: "Riley" });

      const { agent: outsider } = await signedInAgent(app);
      const res = await outsider.get(`/api/players/${player.body.id}/evaluation-results`);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/players/evaluation-scores (roster-wide, for the scrimmage balancer)", () => {
    it("omits players with no results and reports each scored test's latest 1-100 score for those that have one", async () => {
      const { agent } = await signedInAgent(app);
      const unrated = await agent.post("/api/players").send({ name: "Unrated" });
      const rated = await agent.post("/api/players").send({ name: "Rated" });
      const test = await agent.post("/api/evaluation-tests").send(sprintTest()); // worst 15, best 5

      await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-08-01",
        results: [{ playerId: rated.body.id, value: 15 }], // worst -> score 1
      });
      await agent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-08-08",
        results: [{ playerId: rated.body.id, value: 5 }], // best -> score 100, and the latest
      });

      const res = await agent.get("/api/players/evaluation-scores");
      expect(res.status).toBe(200);
      expect(res.body[unrated.body.id]).toBeUndefined();
      expect(res.body[rated.body.id][test.body.id]).toBe(100);
    });

    it("scopes results to the requesting team, never leaking another team's scores", async () => {
      const { agent: owner } = await signedInAgent(app);
      const player = await owner.post("/api/players").send({ name: "Owner's Player" });
      const test = await owner.post("/api/evaluation-tests").send(sprintTest());
      await owner.post(`/api/evaluation-tests/${test.body.id}/results`).send({
        date: "2026-08-01",
        results: [{ playerId: player.body.id, value: 9.8 }],
      });

      const { agent: outsider } = await signedInAgent(app);
      const res = await outsider.get("/api/players/evaluation-scores");
      expect(res.status).toBe(200);
      expect(res.body[player.body.id]).toBeUndefined();
    });
  });

  it("a Club coach shares the account owner's test library and can record results against it", async () => {
    const { agent: ownerAgent, email: ownerEmail } = await signedInAgent(app);
    await setPlan(ownerEmail, "club");
    const test = await ownerAgent.post("/api/evaluation-tests").send(sprintTest());
    const player = await ownerAgent.post("/api/players").send({ name: "Riley" });

    const { agent: coachAgent, email: coachEmail } = await signedInAgent(app);
    const invite = await ownerAgent.post("/api/coaches/invite").send({ email: coachEmail });
    expect(invite.status).toBe(201);

    // The invite email never actually sends in this test env, so insert the
    // membership row directly rather than accepting via token.
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const ownerAccount = await pool.query("SELECT id FROM accounts WHERE email = $1", [ownerEmail]);
    const coachAccount = await pool.query("SELECT id FROM accounts WHERE email = $1", [coachEmail]);
    await pool.query("INSERT INTO account_memberships (owner_account_id, member_account_id) VALUES ($1, $2)", [
      ownerAccount.rows[0].id,
      coachAccount.rows[0].id,
    ]);
    await pool.end();

    const list = await coachAgent.get("/api/evaluation-tests");
    expect(list.body.some((t: { id: number }) => t.id === test.body.id)).toBe(true);

    const session = await coachAgent.get("/api/session");
    const ownerTeamId = session.body.teams[0].id;
    await coachAgent.put("/api/session/team").send({ teamId: ownerTeamId });

    const record = await coachAgent.post(`/api/evaluation-tests/${test.body.id}/results`).send({
      date: "2026-08-01",
      results: [{ playerId: player.body.id, value: 9.8 }],
    });
    expect(record.status).toBe(201);
  });
});

describe("evaluation tests — role permissions", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  async function joinAsRole(app: express.Express, role: "assistant" | "helper") {
    const { agent: ownerAgent, email: ownerEmail } = await signedInAgent(app);
    await setPlan(ownerEmail, "club");
    const { agent: memberAgent } = await signedInAgent(app);
    const memberSession = await memberAgent.get("/api/session");
    const memberAccountId = memberSession.body.account.id;

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const ownerRow = await pool.query("SELECT id FROM accounts WHERE email = $1", [ownerEmail]);
    await pool.query(
      "INSERT INTO account_memberships (owner_account_id, member_account_id, role) VALUES ($1, $2, $3)",
      [ownerRow.rows[0].id, memberAccountId, role],
    );
    await pool.end();
    return { ownerAgent, memberAgent };
  }

  it("blocks an assistant from creating, editing, deleting, or community-sharing an evaluation test", async () => {
    const { ownerAgent, memberAgent } = await joinAsRole(app, "assistant");

    const create = await memberAgent.post("/api/evaluation-tests").send(sprintTest());
    expect(create.status).toBe(403);

    // A real test the owner made, to exercise edit/delete/share against.
    const test = await ownerAgent.post("/api/evaluation-tests").send(sprintTest());

    const update = await memberAgent.put(`/api/evaluation-tests/${test.body.id}`).send({ name: "Renamed" });
    expect(update.status).toBe(403);

    const share = await memberAgent.put(`/api/evaluation-tests/${test.body.id}/share-community`).send({ shared: true });
    expect(share.status).toBe(403);

    const del = await memberAgent.delete(`/api/evaluation-tests/${test.body.id}`);
    expect(del.status).toBe(403);
  });

  it("blocks a helper from creating an evaluation test — helpers can only take attendance and add notes", async () => {
    const { memberAgent } = await joinAsRole(app, "helper");
    const res = await memberAgent.post("/api/evaluation-tests").send(sprintTest());
    expect(res.status).toBe(403);
  });
});
