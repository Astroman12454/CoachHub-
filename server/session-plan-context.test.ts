// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { setupAuth, requireAuth } from "./auth";
import { registerRoutes, buildSessionPlanContext } from "./routes";

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

// The neglected-plays test needs 4 plays, above the free plan's limit of 3.
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

async function currentTeamId(agent: request.Agent): Promise<number> {
  const session = await agent.get("/api/session");
  return session.body.currentTeamId;
}

function onePlay(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Horns Flare",
    category: "offense",
    courtType: "half",
    steps: [{ tokens: [{ id: "o1", type: "offense", label: "1", x: 50, y: 90 }], drawings: [] }],
    ...overrides,
  };
}

function oneSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Practice",
    date: "2026-09-01",
    time: "17:00",
    duration: 60,
    exerciseIds: [],
    playIds: [],
    notes: null,
    ...overrides,
  };
}

describe("buildSessionPlanContext", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("returns empty context for a team with no injuries, drill history, or plays", async () => {
    const agent = await signedInAgent(app);
    const teamId = await currentTeamId(agent);

    const context = await buildSessionPlanContext(teamId);
    expect(context).toEqual({ injuredPlayerNames: [], weakDrills: [], neglectedPlays: [] });
  });

  it("lists only currently (not recovered) injured players by name", async () => {
    const agent = await signedInAgent(app);
    const teamId = await currentTeamId(agent);

    const hurt = await agent.post("/api/players").send({ name: "Injured Player" });
    const healthy = await agent.post("/api/players").send({ name: "Healthy Player" });
    const recovered = await agent.post("/api/players").send({ name: "Recovered Player" });

    await agent.post(`/api/players/${hurt.body.id}/injuries`).send({ description: "Sprained ankle", reportedDate: "2026-09-01" });
    const recoveredInjury = await agent.post(`/api/players/${recovered.body.id}/injuries`).send({ description: "Jammed finger", reportedDate: "2026-08-01" });
    await agent.put(`/api/players/${recovered.body.id}/injuries/${recoveredInjury.body.id}/recover`).send({ recoveredDate: "2026-08-15" });

    const context = await buildSessionPlanContext(teamId);
    expect(context.injuredPlayerNames).toEqual(["Injured Player"]);
  });

  it("flags weak drills only with a real sample size and a sub-60% make rate", async () => {
    const agent = await signedInAgent(app);
    const teamId = await currentTeamId(agent);
    const player = await agent.post("/api/players").send({ name: "Shooter" });

    // Weak with enough attempts: 2/5 made = 40%.
    for (const made of [1, 0, 1, 0, 0]) {
      await agent.post(`/api/players/${player.body.id}/drill-attempts`).send({ drillName: "Free throws", date: "2026-09-01", made });
    }
    // Too small a sample to call it weak, even at 0%.
    await agent.post(`/api/players/${player.body.id}/drill-attempts`).send({ drillName: "Corner threes", date: "2026-09-01", made: 0 });
    // Strong enough to not count as weak: 4/5 made = 80%.
    for (const made of [1, 1, 1, 1, 0]) {
      await agent.post(`/api/players/${player.body.id}/drill-attempts`).send({ drillName: "Layups", date: "2026-09-01", made });
    }

    const context = await buildSessionPlanContext(teamId);
    expect(context.weakDrills).toEqual([{ drillName: "Free throws", percentage: 40, attempts: 5 }]);
  });

  it("ranks neglected plays by how rarely they've been practiced, capped at 3", async () => {
    const agent = await signedInPaidAgent(app);
    const teamId = await currentTeamId(agent);

    const never = await agent.post("/api/plays").send(onePlay({ name: "Never Run" }));
    const once = await agent.post("/api/plays").send(onePlay({ name: "Run Once" }));
    const twice = await agent.post("/api/plays").send(onePlay({ name: "Run Twice" }));
    const thrice = await agent.post("/api/plays").send(onePlay({ name: "Run Thrice" }));

    await agent.post("/api/training-sessions").send(oneSession({ playIds: [once.body.id.toString()] }));
    await agent.post("/api/training-sessions").send(oneSession({ playIds: [twice.body.id.toString(), thrice.body.id.toString()] }));
    await agent.post("/api/training-sessions").send(oneSession({ playIds: [twice.body.id.toString(), thrice.body.id.toString()] }));
    await agent.post("/api/training-sessions").send(oneSession({ playIds: [thrice.body.id.toString()] }));

    const context = await buildSessionPlanContext(teamId);
    expect(context.neglectedPlays.map((p) => p.name)).toEqual(["Never Run", "Run Once", "Run Twice"]);
    expect(context.neglectedPlays).toHaveLength(3);
  });
});
