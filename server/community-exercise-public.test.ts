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

async function signedInPaidAgent(app: express.Express) {
  const { agent, email } = await signedInAgent(app);
  await setPlan(email, "paid");
  return { agent, email };
}

function exerciseBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Layup Lines", description: "Basic finishing at the rim",
    category: "shooting", duration: 10, difficulty: "easy", ...overrides,
  };
}

async function shareNewExercise(agent: request.Agent, overrides: Partial<Record<string, unknown>> = {}) {
  await agent.put("/api/account/public-name").send({ publicName: "Coach Public" });
  const create = await agent.post("/api/exercises").send(exerciseBody(overrides));
  await agent.put(`/api/exercises/${create.body.id}/share-community`).send({ shared: true });
  return create.body.id as number;
}

describe("GET /api/community-exercises/:id/public", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("is reachable without being signed in at all", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const id = await shareNewExercise(owner);

    // A brand-new supertest agent with no cookies — nothing authenticates it.
    const res = await request(app).get(`/api/community-exercises/${id}/public`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, name: "Layup Lines" });
  });

  it("never exposes which account owns the exercise", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const id = await shareNewExercise(owner);

    const res = await request(app).get(`/api/community-exercises/${id}/public`);
    expect(res.body.accountId).toBeUndefined();
  });

  it("404s for an exercise that was never shared to the community", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const create = await owner.post("/api/exercises").send(exerciseBody({ name: "Private Drill" }));

    const res = await request(app).get(`/api/community-exercises/${create.body.id}/public`);
    expect(res.status).toBe(404);
  });

  it("404s once the exercise's community share is revoked", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const id = await shareNewExercise(owner);
    await owner.put(`/api/exercises/${id}/share-community`).send({ shared: false });

    const res = await request(app).get(`/api/community-exercises/${id}/public`);
    expect(res.status).toBe(404);
  });

  it("404s for a nonexistent id", async () => {
    const res = await request(app).get("/api/community-exercises/999999999/public");
    expect(res.status).toBe(404);
  });
});

describe("GET /sitemap.xml", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("is valid XML including the known static pages", async () => {
    const res = await request(app).get("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/xml/);
    expect(res.text).toContain("<urlset");
    expect(res.text).toContain("<loc>");
  });

  it("lists a community-shared exercise's public URL", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const id = await shareNewExercise(owner);

    const res = await request(app).get("/sitemap.xml");
    expect(res.text).toContain(`/community/exercises/${id}</loc>`);
  });

  it("never lists an exercise that isn't community-shared", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const create = await owner.post("/api/exercises").send(exerciseBody({ name: "Not Shared" }));

    const res = await request(app).get("/sitemap.xml");
    expect(res.text).not.toContain(`/community/exercises/${create.body.id}</loc>`);
  });
});
