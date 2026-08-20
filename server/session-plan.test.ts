// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { setupAuth, requireAuth } from "./auth";
import { registerRoutes } from "./routes";
import { storage } from "./storage";

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

// A free account whose one-time trial generation has already been spent —
// what "free plan, no access at all" actually looks like now that a brand
// new free account gets one free shot (see canGenerateAiSessionPlan).
async function signedInFreeAgentWithTrialUsed(app: express.Express) {
  const email = uniqueEmail();
  const agent = request.agent(app);
  await agent.post("/api/signup").send({ email, password: PASSWORD });
  const account = await storage.getAccountByEmail(email);
  await storage.markAiSessionPlanTrialUsed(account!.id);
  return agent;
}

describe("AI practice plan generation", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("rejects a free account that has already used its trial generation", async () => {
    const agent = await signedInFreeAgentWithTrialUsed(app);

    const res = await agent.post("/api/training-sessions/generate-plan").send({});
    expect(res.status).toBe(403);
  });

  it("lets a brand-new free account past the plan gate — the trial is unused", async () => {
    // A fresh free account gets one free generation, so the plan gate lets
    // it through; it's the missing ANTHROPIC_API_KEY in this sandboxed test
    // environment that stops it here, not the entitlement check (503, not 403).
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/api/signup").send({ email, password: PASSWORD });

    const res = await agent.post("/api/training-sessions/generate-plan").send({});
    expect(res.status).toBe(503);
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
    // Free plan with the trial already spent + no ANTHROPIC_API_KEY: should
    // still be 403 (plan), not 503 (config) — a free-plan coach with no
    // access left shouldn't see a "not configured" message that implies
    // this is a temporary outage rather than a plan limit.
    const agent = await signedInFreeAgentWithTrialUsed(app);

    const res = await agent.post("/api/training-sessions/generate-plan").send({});
    expect(res.status).toBe(403);
  });

  it("reflects trial state on GET /api/session, and marking it used sticks", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/api/signup").send({ email, password: PASSWORD });

    const before = await agent.get("/api/session");
    expect(before.body.account.aiSessionPlanTrialUsed).toBe(false);

    const account = await storage.getAccountByEmail(email);
    await storage.markAiSessionPlanTrialUsed(account!.id);

    const after = await agent.get("/api/session");
    expect(after.body.account.aiSessionPlanTrialUsed).toBe(true);
  });

  it("markAiSessionPlanTrialUsed is idempotent — a second call doesn't clobber the first timestamp", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/api/signup").send({ email, password: PASSWORD });
    const account = await storage.getAccountByEmail(email);

    await storage.markAiSessionPlanTrialUsed(account!.id);
    const firstMark = (await storage.getAccountById(account!.id))!.aiSessionPlanTrialUsedAt;

    await storage.markAiSessionPlanTrialUsed(account!.id);
    const secondMark = (await storage.getAccountById(account!.id))!.aiSessionPlanTrialUsedAt;

    expect(secondMark).toEqual(firstMark);
  });

  it("rejects malformed instructions", async () => {
    const agent = await signedInPaidAgent(app);
    const res = await agent.post("/api/training-sessions/generate-plan").send({ instructions: "a".repeat(501) });
    expect(res.status).toBe(400);
  });

  it("rejects a player count of 0 or below", async () => {
    const agent = await signedInPaidAgent(app);
    const res = await agent.post("/api/training-sessions/generate-plan").send({ playerCount: 0 });
    expect(res.status).toBe(400);
  });

  it("rejects a non-integer player count", async () => {
    const agent = await signedInPaidAgent(app);
    const res = await agent.post("/api/training-sessions/generate-plan").send({ playerCount: 5.5 });
    expect(res.status).toBe(400);
  });
});
