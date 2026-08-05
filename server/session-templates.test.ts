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

function onePlay(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Horns Flare",
    category: "offense",
    courtType: "half",
    steps: [
      {
        tokens: [{ id: "o1", type: "offense", label: "1", x: 50, y: 90 }],
        drawings: [],
      },
    ],
    ...overrides,
  };
}

function oneTemplate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Shooting Focus",
    duration: 90,
    exerciseIds: [],
    playIds: [],
    notes: "Warm up first",
    ...overrides,
  };
}

describe("session templates", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("creates a template and returns it in the list", async () => {
    const agent = await signedInAgent(app);
    const created = await agent.post("/api/session-templates").send(oneTemplate());
    expect(created.status).toBe(201);
    expect(created.body.name).toBe("Shooting Focus");
    expect(created.body.duration).toBe(90);

    const list = await agent.get("/api/session-templates");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
  });

  it("rejects a template without a name or duration", async () => {
    const agent = await signedInAgent(app);
    const missingName = await agent.post("/api/session-templates").send(oneTemplate({ name: "" }));
    expect(missingName.status).toBe(400);

    const missingDuration = await agent.post("/api/session-templates").send(oneTemplate({ duration: 0 }));
    expect(missingDuration.status).toBe(400);
  });

  it("strips playIds that don't belong to the requesting team", async () => {
    const owner = await signedInAgent(app);
    const outsidersPlay = await owner.post("/api/plays").send(onePlay());

    const otherCoach = await signedInAgent(app);
    const template = await otherCoach.post("/api/session-templates").send(
      oneTemplate({ playIds: [outsidersPlay.body.id.toString()] }),
    );
    expect(template.status).toBe(201);
    expect(template.body.playIds).toEqual([]);
  });

  it("scopes the template list to the requesting team", async () => {
    const teamA = await signedInAgent(app);
    await teamA.post("/api/session-templates").send(oneTemplate());

    const teamB = await signedInAgent(app);
    const listForB = await teamB.get("/api/session-templates");
    expect(listForB.body).toEqual([]);
  });

  it("deletes a template scoped to the requesting team", async () => {
    const owner = await signedInAgent(app);
    const created = await owner.post("/api/session-templates").send(oneTemplate());

    const otherCoach = await signedInAgent(app);
    const deniedDelete = await otherCoach.delete(`/api/session-templates/${created.body.id}`);
    expect(deniedDelete.status).toBe(404);

    const ownDelete = await owner.delete(`/api/session-templates/${created.body.id}`);
    expect(ownDelete.status).toBe(204);

    const list = await owner.get("/api/session-templates");
    expect(list.body).toEqual([]);
  });
});
