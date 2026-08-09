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

describe("players — birth date and height", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("creates a player with a birth date and height, and returns them back", async () => {
    const agent = await signedInAgent(app);
    const res = await agent.post("/api/players").send({
      name: "Jamie Rivera",
      position: "Point Guard",
      birthDate: "2010-05-14",
      height: 178,
    });
    expect(res.status).toBe(201);
    expect(res.body.birthDate).toBe("2010-05-14");
    expect(res.body.height).toBe(178);
  });

  it("creates a player with neither field, defaulting both to null", async () => {
    const agent = await signedInAgent(app);
    const res = await agent.post("/api/players").send({ name: "Sam" });
    expect(res.status).toBe(201);
    expect(res.body.birthDate).toBeNull();
    expect(res.body.height).toBeNull();
  });

  it("rejects a malformed birth date", async () => {
    const agent = await signedInAgent(app);
    const res = await agent.post("/api/players").send({ name: "Sam", birthDate: "05/14/2010" });
    expect(res.status).toBe(400);
  });

  it("rejects an out-of-range height", async () => {
    const agent = await signedInAgent(app);
    const res = await agent.post("/api/players").send({ name: "Sam", height: 5 });
    expect(res.status).toBe(400);
  });

  it("updates an existing player's birth date and height", async () => {
    const agent = await signedInAgent(app);
    const created = await agent.post("/api/players").send({ name: "Alex" });

    const updated = await agent.put(`/api/players/${created.body.id}`).send({
      birthDate: "2011-11-02",
      height: 165,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.birthDate).toBe("2011-11-02");
    expect(updated.body.height).toBe(165);
  });

  it("clears a birth date by sending null", async () => {
    const agent = await signedInAgent(app);
    const created = await agent.post("/api/players").send({ name: "Alex", birthDate: "2011-11-02" });

    const cleared = await agent.put(`/api/players/${created.body.id}`).send({ birthDate: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.birthDate).toBeNull();
  });
});

describe("players — jersey number", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("creates a player with a jersey number", async () => {
    const agent = await signedInAgent(app);
    const res = await agent.post("/api/players").send({ name: "Jordan", jerseyNumber: 23 });
    expect(res.status).toBe(201);
    expect(res.body.jerseyNumber).toBe(23);
  });

  it("rejects a negative jersey number", async () => {
    const agent = await signedInAgent(app);
    const res = await agent.post("/api/players").send({ name: "Sam", jerseyNumber: -1 });
    expect(res.status).toBe(400);
  });

  it("rejects a jersey number above 99", async () => {
    const agent = await signedInAgent(app);
    const res = await agent.post("/api/players").send({ name: "Sam", jerseyNumber: 100 });
    expect(res.status).toBe(400);
  });

  it("updates and clears a jersey number", async () => {
    const agent = await signedInAgent(app);
    const created = await agent.post("/api/players").send({ name: "Taylor", jerseyNumber: 7 });

    const updated = await agent.put(`/api/players/${created.body.id}`).send({ jerseyNumber: 12 });
    expect(updated.status).toBe(200);
    expect(updated.body.jerseyNumber).toBe(12);

    const cleared = await agent.put(`/api/players/${created.body.id}`).send({ jerseyNumber: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.jerseyNumber).toBeNull();
  });

  it("allows two players on the same team to share a jersey number", async () => {
    const agent = await signedInAgent(app);
    const first = await agent.post("/api/players").send({ name: "Player One", jerseyNumber: 5 });
    const second = await agent.post("/api/players").send({ name: "Player Two", jerseyNumber: 5 });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.jerseyNumber).toBe(5);
  });
});
