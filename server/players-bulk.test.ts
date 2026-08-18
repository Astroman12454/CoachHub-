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

// Covers POST /api/players/bulk — quick roster entry (name + optional jersey
// number, many at once) added alongside the full single-player form.
describe("POST /api/players/bulk", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("creates several players in one call, defaulting them to active", async () => {
    const { agent } = await signedInAgent(app);
    const res = await agent.post("/api/players/bulk").send({
      players: [{ name: "Ana" }, { name: "Boj", jerseyNumber: 7 }, { name: "Cira" }],
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(3);
    expect(res.body.every((p: { isActive: number }) => p.isActive === 1)).toBe(true);
    expect(res.body.find((p: { name: string }) => p.name === "Boj").jerseyNumber).toBe(7);

    const list = await agent.get("/api/players");
    expect(list.body).toHaveLength(3);
  });

  it("rejects an empty batch", async () => {
    const { agent } = await signedInAgent(app);
    const res = await agent.post("/api/players/bulk").send({ players: [] });
    expect(res.status).toBe(400);
  });

  it("enforces the free plan's player limit across the whole batch, not just per-player", async () => {
    const { agent } = await signedInAgent(app);
    // Free plan allows 15 players total; adding 16 in one batch should be
    // rejected outright rather than silently creating 15 and dropping 1.
    const players = Array.from({ length: 16 }, (_, i) => ({ name: `Player ${i}` }));
    const res = await agent.post("/api/players/bulk").send({ players });
    expect(res.status).toBe(403);

    const list = await agent.get("/api/players");
    expect(list.body).toHaveLength(0);
  });

  it("allows a batch that exactly fills the remaining free-plan room", async () => {
    const { agent, email } = await signedInAgent(app);
    await agent.post("/api/players/bulk").send({ players: [{ name: "Existing" }] });
    const remaining = Array.from({ length: 14 }, (_, i) => ({ name: `Player ${i}` }));
    const res = await agent.post("/api/players/bulk").send({ players: remaining });
    expect(res.status).toBe(201);
    void email;

    const list = await agent.get("/api/players");
    expect(list.body).toHaveLength(15);
  });

  it("is unlimited on a paid plan", async () => {
    const { agent, email } = await signedInAgent(app);
    await setPlan(email, "paid");
    const players = Array.from({ length: 20 }, (_, i) => ({ name: `Player ${i}` }));
    const res = await agent.post("/api/players/bulk").send({ players });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(20);
  });

  it("scopes the created players to the requesting team", async () => {
    const { agent: agentA } = await signedInAgent(app);
    const { agent: agentB } = await signedInAgent(app);
    await agentA.post("/api/players/bulk").send({ players: [{ name: "A's Player" }] });

    const listA = await agentA.get("/api/players");
    const listB = await agentB.get("/api/players");
    expect(listA.body).toHaveLength(1);
    expect(listB.body).toHaveLength(0);
  });
});
