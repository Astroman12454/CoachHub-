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

describe("teams — default session duration", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("sets and clears a team's default session duration", async () => {
    const agent = await signedInAgent(app);
    const teams = await agent.get("/api/teams");
    const teamId = teams.body[0].id;

    const set = await agent.put(`/api/teams/${teamId}`).send({ defaultSessionDuration: 90 });
    expect(set.status).toBe(200);
    expect(set.body.defaultSessionDuration).toBe(90);

    const cleared = await agent.put(`/api/teams/${teamId}`).send({ defaultSessionDuration: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.defaultSessionDuration).toBeNull();
  });

  it("rejects a duration below 1 minute", async () => {
    const agent = await signedInAgent(app);
    const teams = await agent.get("/api/teams");
    const teamId = teams.body[0].id;

    const res = await agent.put(`/api/teams/${teamId}`).send({ defaultSessionDuration: 0 });
    expect(res.status).toBe(400);
  });

  it("404s when updating a team belonging to a different account", async () => {
    const owner = await signedInAgent(app);
    const ownerTeams = await owner.get("/api/teams");
    const ownerTeamId = ownerTeams.body[0].id;

    const outsider = await signedInAgent(app);
    const res = await outsider.put(`/api/teams/${ownerTeamId}`).send({ defaultSessionDuration: 90 });
    expect(res.status).toBe(404);
  });
});
