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

function oneAttempt(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    drillName: "Free throws",
    date: "2026-09-01",
    made: 1,
    ...overrides,
  };
}

describe("drill attempts", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("starts with no attempts, for the player or the team", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Jamie" });

    const history = await agent.get(`/api/players/${player.body.id}/drill-attempts`);
    expect(history.status).toBe(200);
    expect(history.body).toEqual([]);

    const teamWide = await agent.get("/api/players/drill-attempts");
    expect(teamWide.body).toEqual([]);
  });

  it("logs a made attempt and a missed attempt as separate rows", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Devon" });

    const made = await agent.post(`/api/players/${player.body.id}/drill-attempts`).send(oneAttempt({ made: 1 }));
    expect(made.status).toBe(201);
    expect(made.body.made).toBe(1);
    expect(made.body.drillName).toBe("Free throws");

    const missed = await agent.post(`/api/players/${player.body.id}/drill-attempts`).send(oneAttempt({ made: 0 }));
    expect(missed.status).toBe(201);
    expect(missed.body.made).toBe(0);

    const history = await agent.get(`/api/players/${player.body.id}/drill-attempts`);
    expect(history.body).toHaveLength(2);

    const teamWide = await agent.get("/api/players/drill-attempts");
    expect(teamWide.body).toHaveLength(2);
    expect(teamWide.body.every((a: { playerId: number }) => a.playerId === player.body.id)).toBe(true);
  });

  it("rejects an attempt with no drill name, no date, or an invalid made value", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Riley" });

    const missingName = await agent.post(`/api/players/${player.body.id}/drill-attempts`).send(oneAttempt({ drillName: "" }));
    expect(missingName.status).toBe(400);

    const missingDate = await agent.post(`/api/players/${player.body.id}/drill-attempts`).send(oneAttempt({ date: "" }));
    expect(missingDate.status).toBe(400);

    const invalidMade = await agent.post(`/api/players/${player.body.id}/drill-attempts`).send(oneAttempt({ made: 2 }));
    expect(invalidMade.status).toBe(400);
  });

  it("undoes an attempt by deleting the row it returned", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Casey" });
    const logged = await agent.post(`/api/players/${player.body.id}/drill-attempts`).send(oneAttempt());

    const del = await agent.delete(`/api/players/${player.body.id}/drill-attempts/${logged.body.id}`);
    expect(del.status).toBe(204);

    const history = await agent.get(`/api/players/${player.body.id}/drill-attempts`);
    expect(history.body).toEqual([]);
  });

  it("scopes drill attempts to the requesting team", async () => {
    const owner = await signedInAgent(app);
    const player = await owner.post("/api/players").send({ name: "Team A Player" });
    const attempt = await owner.post(`/api/players/${player.body.id}/drill-attempts`).send(oneAttempt());

    const outsider = await signedInAgent(app);

    const historyRes = await outsider.get(`/api/players/${player.body.id}/drill-attempts`);
    expect(historyRes.status).toBe(404);

    const createRes = await outsider.post(`/api/players/${player.body.id}/drill-attempts`).send(oneAttempt());
    expect(createRes.status).toBe(404);

    const deleteRes = await outsider.delete(`/api/players/${player.body.id}/drill-attempts/${attempt.body.id}`);
    expect(deleteRes.status).toBe(404);

    const teamWideForOutsider = await outsider.get("/api/players/drill-attempts");
    expect(teamWideForOutsider.body).toEqual([]);
  });
});
