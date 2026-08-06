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

function oneInjury(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    description: "Sprained ankle",
    reportedDate: "2026-09-01",
    ...overrides,
  };
}

describe("player injuries", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("starts with no injury history and doesn't show up in the active list", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Jamie" });

    const history = await agent.get(`/api/players/${player.body.id}/injuries`);
    expect(history.status).toBe(200);
    expect(history.body).toEqual([]);

    const active = await agent.get("/api/players/injuries");
    expect(active.body).toEqual([]);
  });

  it("reports an injury as active and lists it team-wide", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Devon" });

    const created = await agent.post(`/api/players/${player.body.id}/injuries`).send(oneInjury());
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("active");
    expect(created.body.description).toBe("Sprained ankle");

    const active = await agent.get("/api/players/injuries");
    expect(active.body).toHaveLength(1);
    expect(active.body[0].playerId).toBe(player.body.id);
  });

  it("rejects an injury with no description or date", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Riley" });

    const missingDescription = await agent.post(`/api/players/${player.body.id}/injuries`).send(oneInjury({ description: "" }));
    expect(missingDescription.status).toBe(400);

    const missingDate = await agent.post(`/api/players/${player.body.id}/injuries`).send(oneInjury({ reportedDate: "" }));
    expect(missingDate.status).toBe(400);
  });

  it("marks an injury recovered, removing it from the active list but keeping it in history", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Casey" });
    const created = await agent.post(`/api/players/${player.body.id}/injuries`).send(oneInjury());

    const recovered = await agent
      .put(`/api/players/${player.body.id}/injuries/${created.body.id}/recover`)
      .send({ recoveredDate: "2026-09-15" });
    expect(recovered.status).toBe(200);
    expect(recovered.body.status).toBe("recovered");
    expect(recovered.body.recoveredDate).toBe("2026-09-15");

    const active = await agent.get("/api/players/injuries");
    expect(active.body).toEqual([]);

    const history = await agent.get(`/api/players/${player.body.id}/injuries`);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].status).toBe("recovered");
  });

  it("deletes an injury record", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Morgan" });
    const created = await agent.post(`/api/players/${player.body.id}/injuries`).send(oneInjury());

    const del = await agent.delete(`/api/players/${player.body.id}/injuries/${created.body.id}`);
    expect(del.status).toBe(204);

    const history = await agent.get(`/api/players/${player.body.id}/injuries`);
    expect(history.body).toEqual([]);
  });

  it("scopes injuries to the requesting team", async () => {
    const owner = await signedInAgent(app);
    const player = await owner.post("/api/players").send({ name: "Team A Player" });
    const injury = await owner.post(`/api/players/${player.body.id}/injuries`).send(oneInjury());

    const outsider = await signedInAgent(app);

    const historyRes = await outsider.get(`/api/players/${player.body.id}/injuries`);
    expect(historyRes.status).toBe(404);

    const createRes = await outsider.post(`/api/players/${player.body.id}/injuries`).send(oneInjury());
    expect(createRes.status).toBe(404);

    const recoverRes = await outsider
      .put(`/api/players/${player.body.id}/injuries/${injury.body.id}/recover`)
      .send({ recoveredDate: "2026-09-15" });
    expect(recoverRes.status).toBe(404);

    const deleteRes = await outsider.delete(`/api/players/${player.body.id}/injuries/${injury.body.id}`);
    expect(deleteRes.status).toBe(404);

    const activeForOutsider = await outsider.get("/api/players/injuries");
    expect(activeForOutsider.body).toEqual([]);
  });
});
