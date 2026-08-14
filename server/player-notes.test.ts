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

describe("player notes", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("starts with no notes", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Jamie" });

    const notes = await agent.get(`/api/players/${player.body.id}/notes`);
    expect(notes.status).toBe(200);
    expect(notes.body).toEqual([]);
  });

  it("adds and deletes coach notes", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Morgan" });

    const add = await agent.post(`/api/players/${player.body.id}/notes`).send({ content: "Great hustle in practice." });
    expect(add.status).toBe(201);
    expect(add.body.content).toBe("Great hustle in practice.");

    const notes = await agent.get(`/api/players/${player.body.id}/notes`);
    expect(notes.body).toHaveLength(1);

    const del = await agent.delete(`/api/players/${player.body.id}/notes/${add.body.id}`);
    expect(del.status).toBe(204);

    const notesAfter = await agent.get(`/api/players/${player.body.id}/notes`);
    expect(notesAfter.body).toHaveLength(0);
  });

  it("rejects an empty note", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Avery" });

    const res = await agent.post(`/api/players/${player.body.id}/notes`).send({ content: "" });
    expect(res.status).toBe(400);
  });

  it("scopes notes to the requesting team", async () => {
    const owner = await signedInAgent(app);
    const player = await owner.post("/api/players").send({ name: "Team A Player" });
    const note = await owner.post(`/api/players/${player.body.id}/notes`).send({ content: "Owner's note" });

    const outsider = await signedInAgent(app);
    const notesRes = await outsider.get(`/api/players/${player.body.id}/notes`);
    expect(notesRes.status).toBe(404);

    const noteRes = await outsider.post(`/api/players/${player.body.id}/notes`).send({ content: "Intruder" });
    expect(noteRes.status).toBe(404);

    const deleteRes = await outsider.delete(`/api/players/${player.body.id}/notes/${note.body.id}`);
    expect(deleteRes.status).toBe(404);
  });
});
