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

describe("natural-language command parsing", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("rejects on the free plan", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/api/signup").send({ email, password: PASSWORD });

    const res = await agent.post("/api/ai/parse-command").send({ text: "create a session tomorrow at 6pm" });
    expect(res.status).toBe(403);
  });

  it("returns 503 when AI isn't configured (no ANTHROPIC_API_KEY in this environment)", async () => {
    const agent = await signedInPaidAgent(app);
    const res = await agent.post("/api/ai/parse-command").send({ text: "create a session tomorrow at 6pm" });
    expect(res.status).toBe(503);
  });

  it("checks the plan gate before the AI-configured check", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/api/signup").send({ email, password: PASSWORD });

    const res = await agent.post("/api/ai/parse-command").send({ text: "create a session tomorrow at 6pm" });
    expect(res.status).toBe(403);
  });

  it("rejects an empty or missing command", async () => {
    const agent = await signedInPaidAgent(app);
    const empty = await agent.post("/api/ai/parse-command").send({ text: "" });
    expect(empty.status).toBe(400);
    const missing = await agent.post("/api/ai/parse-command").send({});
    expect(missing.status).toBe(400);
  });

  it("rejects a command over the length limit", async () => {
    const agent = await signedInPaidAgent(app);
    const res = await agent.post("/api/ai/parse-command").send({ text: "a".repeat(301) });
    expect(res.status).toBe(400);
  });
});
