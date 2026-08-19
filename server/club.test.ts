// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { Pool } from "pg";
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

async function signedInClubAgent(app: express.Express) {
  const { agent, email } = await signedInAgent(app);
  await setPlan(email, "club");
  return { agent, email };
}

describe("Club identity and overview", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("is a Club plan feature — a free-plan account is rejected", async () => {
    const { agent } = await signedInAgent(app);
    const getRes = await agent.get("/api/club");
    expect(getRes.status).toBe(403);
    const putRes = await agent.put("/api/club").send({ name: "My Club" });
    expect(putRes.status).toBe(403);
    const overviewRes = await agent.get("/api/club/overview");
    expect(overviewRes.status).toBe(403);
  });

  it("GET /api/club returns null before anything's been saved", async () => {
    const { agent } = await signedInClubAgent(app);
    const res = await agent.get("/api/club");
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("saves and returns the club's name and logo", async () => {
    const { agent } = await signedInClubAgent(app);
    const putRes = await agent.put("/api/club").send({ name: "Riverside Basketball", logoUrl: "https://example.com/logo.png" });
    expect(putRes.status).toBe(200);
    expect(putRes.body.name).toBe("Riverside Basketball");
    expect(putRes.body.logoUrl).toBe("https://example.com/logo.png");

    const getRes = await agent.get("/api/club");
    expect(getRes.body.name).toBe("Riverside Basketball");
  });

  it("upserts — saving again updates the same club, not a second one", async () => {
    const { agent } = await signedInClubAgent(app);
    await agent.put("/api/club").send({ name: "First Name" });
    const second = await agent.put("/api/club").send({ name: "Second Name", logoUrl: null });
    expect(second.status).toBe(200);
    expect(second.body.name).toBe("Second Name");
    expect(second.body.logoUrl).toBeNull();
  });

  it("rejects an empty name", async () => {
    const { agent } = await signedInClubAgent(app);
    const res = await agent.put("/api/club").send({ name: "" });
    expect(res.status).toBe(400);
  });

  it("GET /api/club/overview reports every team's active players, sessions, and attendance", async () => {
    const { agent } = await signedInClubAgent(app);
    await agent.post("/api/players").send({ name: "Player A" });
    await agent.post("/api/players").send({ name: "Player B", isActive: 0 });
    await agent.post("/api/training-sessions").send({ name: "Practice", date: "2026-01-01", time: "18:00", duration: 60 });

    const res = await agent.get("/api/club/overview");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ teamName: "My Team", activePlayersCount: 1, totalSessions: 1 });
  });

  it("GET /api/club/roster lists every player across every team, active and inactive alike", async () => {
    const { agent } = await signedInClubAgent(app);
    await agent.post("/api/players").send({ name: "Zoe", position: "Guard", jerseyNumber: 5 });
    await agent.post("/api/players").send({ name: "Amir", isActive: 0 });

    const res = await agent.get("/api/club/roster");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // Ordered by team name then player name — "Amir" before "Zoe" within
    // the one team both belong to.
    expect(res.body[0]).toMatchObject({ name: "Amir", teamName: "My Team", isActive: 0 });
    expect(res.body[1]).toMatchObject({ name: "Zoe", teamName: "My Team", position: "Guard", jerseyNumber: 5, isActive: 1 });
  });

  it("GET /api/club/roster is a Club plan feature, same as the overview", async () => {
    const { agent } = await signedInAgent(app);
    const res = await agent.get("/api/club/roster");
    expect(res.status).toBe(403);
  });

  // Membership is set up directly at the DB level (rather than going
  // through the real invite-email flow, which coaches.test.ts already
  // covers end to end) — what's under test here is specifically the
  // owner-vs-member authorization split on the club routes themselves.
  it("a joined club member can view the club and overview, but only the owner can edit it", async () => {
    const { agent: ownerAgent, email: ownerEmail } = await signedInClubAgent(app);
    await ownerAgent.put("/api/club").send({ name: "Shared Club" });
    const { agent: coachAgent } = await signedInAgent(app);

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const ownerRow = await pool.query("SELECT id FROM accounts WHERE email = $1", [ownerEmail]);
    const ownerId = ownerRow.rows[0].id;
    const sessionRes = await coachAgent.get("/api/session");
    const coachAccountId = sessionRes.body.account.id;
    await pool.query("INSERT INTO account_memberships (owner_account_id, member_account_id) VALUES ($1, $2)", [ownerId, coachAccountId]);
    await pool.end();

    const getRes = await coachAgent.get("/api/club");
    expect(getRes.status).toBe(200);
    expect(getRes.body.name).toBe("Shared Club");

    const overviewRes = await coachAgent.get("/api/club/overview");
    expect(overviewRes.status).toBe(200);

    const putRes = await coachAgent.put("/api/club").send({ name: "Hijacked" });
    expect(putRes.status).toBe(403);
  });
});
