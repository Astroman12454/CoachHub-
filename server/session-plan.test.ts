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

describe("AI practice plan generation", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("rejects on the free plan", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/api/signup").send({ email, password: PASSWORD });

    const res = await agent.post("/api/training-sessions/generate-plan").send({});
    expect(res.status).toBe(403);
  });

  it("returns 503 when AI isn't configured (no ANTHROPIC_API_KEY in this environment), even with exercises in the library", async () => {
    const agent = await signedInPaidAgent(app);
    await agent.post("/api/exercises").send({
      name: "Layup Lines", description: "Basic finishing at the rim", category: "shooting", duration: 10, difficulty: "easy",
    });

    const res = await agent.post("/api/training-sessions/generate-plan").send({});
    expect(res.status).toBe(503);
  });

  it("checks the plan gate before the AI-configured check", async () => {
    // Free plan + no ANTHROPIC_API_KEY: should still be 403 (plan), not 503
    // (config) — a free-plan coach shouldn't see a "not configured" message
    // that implies this is a temporary outage rather than a plan limit.
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/api/signup").send({ email, password: PASSWORD });

    const res = await agent.post("/api/training-sessions/generate-plan").send({});
    expect(res.status).toBe(403);
  });

  it("rejects malformed instructions", async () => {
    const agent = await signedInPaidAgent(app);
    const res = await agent.post("/api/training-sessions/generate-plan").send({ instructions: "a".repeat(501) });
    expect(res.status).toBe(400);
  });
});
