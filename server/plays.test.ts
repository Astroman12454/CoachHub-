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

function onePlay(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Horns Flare",
    category: "offense",
    courtType: "half",
    steps: [
      {
        tokens: [
          { id: "o1", type: "offense", label: "1", x: 50, y: 90 },
          { id: "x1", type: "defense", label: "1", x: 50, y: 80 },
          { id: "ball", type: "ball", label: "", x: 50, y: 92 },
        ],
        drawings: [
          { id: "d1", tool: "move", points: [{ x: 50, y: 90 }, { x: 30, y: 60 }] },
        ],
      },
      {
        tokens: [
          { id: "o1", type: "offense", label: "1", x: 30, y: 60 },
          { id: "x1", type: "defense", label: "1", x: 32, y: 62 },
          { id: "ball", type: "ball", label: "", x: 30, y: 62 },
        ],
        drawings: [],
      },
    ],
    ...overrides,
  };
}

describe("plays (playbook)", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("creates a play with multiple steps and fetches it with steps in order", async () => {
    const agent = await signedInPaidAgent(app);

    const create = await agent.post("/api/plays").send(onePlay());
    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({ name: "Horns Flare", category: "offense", courtType: "half" });

    const detail = await agent.get(`/api/plays/${create.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.steps).toHaveLength(2);
    expect(detail.body.steps[0].stepIndex).toBe(0);
    expect(detail.body.steps[1].stepIndex).toBe(1);
    expect(detail.body.steps[0].tokens).toHaveLength(3);
    expect(detail.body.steps[0].drawings).toHaveLength(1);
  });

  it("lists plays for the team", async () => {
    const agent = await signedInPaidAgent(app);
    await agent.post("/api/plays").send(onePlay({ name: "Play A" }));
    await agent.post("/api/plays").send(onePlay({ name: "Play B" }));

    const list = await agent.get("/api/plays");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
  });

  it("updates a play by fully replacing its steps", async () => {
    const agent = await signedInPaidAgent(app);
    const create = await agent.post("/api/plays").send(onePlay());

    const update = await agent.put(`/api/plays/${create.body.id}`).send(
      onePlay({ name: "Horns Flare (v2)", steps: [onePlay().steps[0]] }),
    );
    expect(update.status).toBe(200);
    expect(update.body.name).toBe("Horns Flare (v2)");

    const detail = await agent.get(`/api/plays/${create.body.id}`);
    expect(detail.body.steps).toHaveLength(1);
  });

  it("deletes a play", async () => {
    const agent = await signedInPaidAgent(app);
    const create = await agent.post("/api/plays").send(onePlay());

    const del = await agent.delete(`/api/plays/${create.body.id}`);
    expect(del.status).toBe(204);

    const detail = await agent.get(`/api/plays/${create.body.id}`);
    expect(detail.status).toBe(404);
  });

  it("scopes plays to the requesting team", async () => {
    const ownerAgent = await signedInPaidAgent(app);
    const create = await ownerAgent.post("/api/plays").send(onePlay());

    const otherAgent = await signedInPaidAgent(app);
    const detail = await otherAgent.get(`/api/plays/${create.body.id}`);
    expect(detail.status).toBe(404);
    const del = await otherAgent.delete(`/api/plays/${create.body.id}`);
    expect(del.status).toBe(404);
  });

  it("enforces the free-plan play limit", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/api/signup").send({ email, password: PASSWORD });

    for (let i = 0; i < 3; i++) {
      const res = await agent.post("/api/plays").send(onePlay({ name: `Play ${i}` }));
      expect(res.status).toBe(201);
    }

    const fourth = await agent.post("/api/plays").send(onePlay({ name: "Play 4" }));
    expect(fourth.status).toBe(403);
  });

  it("rejects a play with no steps", async () => {
    const agent = await signedInPaidAgent(app);
    const res = await agent.post("/api/plays").send(onePlay({ steps: [] }));
    expect(res.status).toBe(400);
  });
});
