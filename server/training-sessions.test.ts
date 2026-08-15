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

function oneSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Tuesday Practice",
    date: "2026-08-11",
    time: "18:00",
    duration: 90,
    exerciseIds: [],
    playIds: [],
    testIds: [],
    ...overrides,
  };
}

describe("training sessions — evaluation tests (testIds)", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("creates a session with evaluation tests to run before the exercises, and returns them back", async () => {
    const agent = await signedInAgent(app);
    const test = await agent.post("/api/evaluation-tests").send({ name: "Sprint 3x Court", type: "time", unit: "seconds", worstValue: 15, bestValue: 5 });

    const created = await agent.post("/api/training-sessions").send(
      oneSession({ testIds: [test.body.id.toString()] }),
    );
    expect(created.status).toBe(201);
    expect(created.body.testIds).toEqual([test.body.id.toString()]);
  });

  it("strips testIds that don't belong to the requesting account", async () => {
    const owner = await signedInAgent(app);
    const outsidersTest = await owner.post("/api/evaluation-tests").send({ name: "Vertical Jump", type: "count", unit: "cm", worstValue: 0, bestValue: 100 });

    const otherCoach = await signedInAgent(app);
    const created = await otherCoach.post("/api/training-sessions").send(
      oneSession({ testIds: [outsidersTest.body.id.toString()] }),
    );
    expect(created.status).toBe(201);
    expect(created.body.testIds).toEqual([]);
  });

  it("updates a session's testIds, stripping any that don't belong to the account", async () => {
    const agent = await signedInAgent(app);
    const test = await agent.post("/api/evaluation-tests").send({ name: "Sprint 3x Court", type: "time", unit: "seconds", worstValue: 15, bestValue: 5 });
    const created = await agent.post("/api/training-sessions").send(oneSession());

    const updated = await agent.put(`/api/training-sessions/${created.body.id}`).send({
      testIds: [test.body.id.toString(), "999999"],
    });
    expect(updated.status).toBe(200);
    expect(updated.body.testIds).toEqual([test.body.id.toString()]);
  });

  it("carries testIds through a saved session template", async () => {
    const agent = await signedInAgent(app);
    const test = await agent.post("/api/evaluation-tests").send({ name: "Sprint 3x Court", type: "time", unit: "seconds", worstValue: 15, bestValue: 5 });

    const template = await agent.post("/api/session-templates").send({
      name: "Physical + Technical",
      duration: 90,
      testIds: [test.body.id.toString()],
    });
    expect(template.status).toBe(201);
    expect(template.body.testIds).toEqual([test.body.id.toString()]);
  });
});
