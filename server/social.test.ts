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

// Publishes a fresh exercise to the community under the given (paid) agent,
// setting a public name first since that's now required to publish.
async function shareNewExercise(agent: request.Agent, overrides: Partial<Record<string, unknown>> = {}) {
  await agent.put("/api/account/public-name").send({ publicName: "Coach Social" });
  const create = await agent.post("/api/exercises").send(exerciseBody(overrides));
  await agent.put(`/api/exercises/${create.body.id}/share-community`).send({ shared: true });
  return create.body.id as number;
}

describe("community exercise likes", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("likes and unlikes a shared exercise, toggling likeCount and likedByMe", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner);

    const { agent: liker } = await signedInAgent(app);
    const like = await liker.post(`/api/community-exercises/${exerciseId}/like`);
    expect(like.status).toBe(204);

    const afterLike = await liker.get("/api/community-exercises");
    const found = afterLike.body.find((ex: { id: number }) => ex.id === exerciseId);
    expect(found.likeCount).toBe(1);
    expect(found.likedByMe).toBe(true);

    const unlike = await liker.delete(`/api/community-exercises/${exerciseId}/like`);
    expect(unlike.status).toBe(204);

    const afterUnlike = await liker.get("/api/community-exercises");
    const foundAfter = afterUnlike.body.find((ex: { id: number }) => ex.id === exerciseId);
    expect(foundAfter.likeCount).toBe(0);
    expect(foundAfter.likedByMe).toBe(false);
  });

  it("is available on the free plan, unlike importing", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner);

    const { agent: freeLiker } = await signedInAgent(app);
    const like = await freeLiker.post(`/api/community-exercises/${exerciseId}/like`);
    expect(like.status).toBe(204);
  });

  it("liking twice is idempotent — likeCount doesn't double-count", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner);

    const { agent: liker } = await signedInAgent(app);
    await liker.post(`/api/community-exercises/${exerciseId}/like`);
    await liker.post(`/api/community-exercises/${exerciseId}/like`);

    const res = await liker.get("/api/community-exercises");
    const found = res.body.find((ex: { id: number }) => ex.id === exerciseId);
    expect(found.likeCount).toBe(1);
  });

  it("likeCount is shared across accounts but likedByMe is per-account", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner);

    const { agent: likerA } = await signedInAgent(app);
    await likerA.post(`/api/community-exercises/${exerciseId}/like`);

    const { agent: likerB } = await signedInAgent(app);
    await likerB.post(`/api/community-exercises/${exerciseId}/like`);

    const resA = await likerA.get("/api/community-exercises");
    const foundA = resA.body.find((ex: { id: number }) => ex.id === exerciseId);
    expect(foundA.likeCount).toBe(2);
    expect(foundA.likedByMe).toBe(true);

    const { agent: bystander } = await signedInAgent(app);
    const resBystander = await bystander.get("/api/community-exercises");
    const foundBystander = resBystander.body.find((ex: { id: number }) => ex.id === exerciseId);
    expect(foundBystander.likeCount).toBe(2);
    expect(foundBystander.likedByMe).toBe(false);
  });

  it("404s liking an exercise that isn't shared or doesn't exist", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const create = await owner.post("/api/exercises").send(exerciseBody());

    const { agent: liker } = await signedInAgent(app);
    const res = await liker.post(`/api/community-exercises/${create.body.id}/like`);
    expect(res.status).toBe(404);

    const unknown = await liker.post("/api/community-exercises/999999/like");
    expect(unknown.status).toBe(404);
  });

  it("unliking something never liked is a harmless no-op", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner);

    const { agent: liker } = await signedInAgent(app);
    const res = await liker.delete(`/api/community-exercises/${exerciseId}/like`);
    expect(res.status).toBe(204);
  });

  it("sorts by popularity when requested, most-liked first", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const popular = await shareNewExercise(owner, { name: "Popular Drill" });
    const unpopular = await shareNewExercise(owner, { name: "Unpopular Drill" });

    const { agent: likerA } = await signedInAgent(app);
    await likerA.post(`/api/community-exercises/${popular}/like`);
    const { agent: likerB } = await signedInAgent(app);
    await likerB.post(`/api/community-exercises/${popular}/like`);

    const res = await owner.get("/api/community-exercises?sort=popular");
    const ids = res.body.map((ex: { id: number }) => ex.id);
    expect(ids.indexOf(popular)).toBeLessThan(ids.indexOf(unpopular));
  });

  it("never leaks which exercises the requester has no relation to (accountId stays absent)", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner);

    const { agent: liker } = await signedInAgent(app);
    await liker.post(`/api/community-exercises/${exerciseId}/like`);

    const res = await liker.get("/api/community-exercises");
    const found = res.body.find((ex: { id: number }) => ex.id === exerciseId);
    expect(found.accountId).toBeUndefined();
  });
});
