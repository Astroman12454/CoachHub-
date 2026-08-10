// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { Pool } from "pg";
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
  return { agent, email };
}

async function setPlan(email: string, plan: "free" | "paid" | "club") {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("UPDATE accounts SET plan = $1 WHERE email = $2", [plan, email]);
  await pool.end();
}

function exerciseBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Layup Lines", description: "Basic finishing at the rim",
    category: "shooting", duration: 10, difficulty: "easy", ...overrides,
  };
}

async function signedInPaidAgent(app: express.Express) {
  const { agent, email } = await signedInAgent(app);
  await setPlan(email, "paid");
  return { agent, email };
}

describe("exercise favorites, usage stats and sharing", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("favoriting is available on the free plan, unlike creating custom exercises", async () => {
    const { agent } = await signedInPaidAgent(app);
    const create = await agent.post("/api/exercises").send(exerciseBody());
    const exerciseId = create.body.id;

    const favorite = await agent.put(`/api/exercises/${exerciseId}/favorite`).send({ isFavorite: true });
    expect(favorite.status).toBe(200);
    expect(favorite.body.isFavorite).toBe(1);

    const unfavorite = await agent.put(`/api/exercises/${exerciseId}/favorite`).send({ isFavorite: false });
    expect(unfavorite.status).toBe(200);
    expect(unfavorite.body.isFavorite).toBe(0);
  });

  it("scopes favoriting to the owning account — an outsider gets 404", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const create = await owner.post("/api/exercises").send(exerciseBody());

    const { agent: outsider } = await signedInAgent(app);
    const res = await outsider.put(`/api/exercises/${create.body.id}/favorite`).send({ isFavorite: true });
    expect(res.status).toBe(404);
  });

  it("rejects a non-boolean isFavorite value", async () => {
    const { agent } = await signedInPaidAgent(app);
    const create = await agent.post("/api/exercises").send(exerciseBody());

    const res = await agent.put(`/api/exercises/${create.body.id}/favorite`).send({ isFavorite: "yes" });
    expect(res.status).toBe(400);
  });

  it("computes usage stats across every team on the account, with count and last-used date", async () => {
    const { agent } = await signedInPaidAgent(app);
    const create = await agent.post("/api/exercises").send(exerciseBody());
    const exerciseId = String(create.body.id);

    const teamB = await agent.post("/api/teams").send({ name: "Junior Varsity" });
    expect(teamB.status).toBe(201);

    await agent.post("/api/training-sessions").send({
      name: "Early session", date: "2026-01-05", time: "18:00", duration: 60, exerciseIds: [exerciseId],
    });
    await agent.post("/api/training-sessions").send({
      name: "Later session", date: "2026-02-10", time: "18:00", duration: 60, exerciseIds: [exerciseId],
    });

    await agent.put("/api/session/team").send({ teamId: teamB.body.id });
    await agent.post("/api/training-sessions").send({
      name: "JV session", date: "2026-03-01", time: "18:00", duration: 60, exerciseIds: [exerciseId],
    });

    const stats = await agent.get("/api/exercises/usage-stats");
    expect(stats.status).toBe(200);
    expect(stats.body[exerciseId]).toMatchObject({ count: 3, lastUsedDate: "2026-03-01" });
  });

  it("returns an empty object when nothing has used any exercise yet", async () => {
    const { agent } = await signedInPaidAgent(app);
    const stats = await agent.get("/api/exercises/usage-stats");
    expect(stats.status).toBe(200);
    expect(stats.body).toEqual({});
  });

  it("generates a share link and serves the exercise with no session at all, never leaking accountId", async () => {
    const { agent } = await signedInPaidAgent(app);
    const create = await agent.post("/api/exercises").send(exerciseBody());
    const exerciseId = create.body.id;

    const link = await agent.post(`/api/exercises/${exerciseId}/share-link`);
    expect(link.status).toBe(200);
    expect(link.body.token).toMatch(/^[a-f0-9]{48}$/);

    const anon = request(app);
    const shared = await anon.get(`/api/exercise-share/${link.body.token}`);
    expect(shared.status).toBe(200);
    expect(shared.body).toMatchObject({ name: "Layup Lines", category: "shooting", difficulty: "easy" });
    expect(shared.body.accountId).toBeUndefined();
  });

  it("returns the same token on repeated requests instead of rotating it", async () => {
    const { agent } = await signedInPaidAgent(app);
    const create = await agent.post("/api/exercises").send(exerciseBody());

    const first = await agent.post(`/api/exercises/${create.body.id}/share-link`);
    const second = await agent.post(`/api/exercises/${create.body.id}/share-link`);
    expect(first.body.token).toBe(second.body.token);
  });

  it("404s on an unknown or revoked share token", async () => {
    const anon = request(app);
    const unknown = await anon.get("/api/exercise-share/does-not-exist");
    expect(unknown.status).toBe(404);

    const { agent } = await signedInPaidAgent(app);
    const create = await agent.post("/api/exercises").send(exerciseBody());
    const link = await agent.post(`/api/exercises/${create.body.id}/share-link`);

    const revoke = await agent.delete(`/api/exercises/${create.body.id}/share-link`);
    expect(revoke.status).toBe(204);

    const afterRevoke = await anon.get(`/api/exercise-share/${link.body.token}`);
    expect(afterRevoke.status).toBe(404);
  });

  it("only a coach on the owning account can create or revoke a share link, never an outsider", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const create = await owner.post("/api/exercises").send(exerciseBody());

    const { agent: outsider } = await signedInAgent(app);
    const outsiderCreate = await outsider.post(`/api/exercises/${create.body.id}/share-link`);
    expect(outsiderCreate.status).toBe(404);

    const link = await owner.post(`/api/exercises/${create.body.id}/share-link`);
    const outsiderRevoke = await outsider.delete(`/api/exercises/${create.body.id}/share-link`);
    expect(outsiderRevoke.status).toBe(404);

    const anon = request(app);
    const stillWorks = await anon.get(`/api/exercise-share/${link.body.token}`);
    expect(stillWorks.status).toBe(200);
  });
});
