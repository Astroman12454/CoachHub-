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

function fullRating(overrides: Partial<Record<string, number>> = {}) {
  return { shooting: 5, dribbling: 5, defense: 5, passing: 5, conditioning: 5, ...overrides };
}

describe("player development (skill ratings + notes)", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("starts with no ratings and no notes", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Jamie" });

    const dev = await agent.get(`/api/players/${player.body.id}/development`);
    expect(dev.status).toBe(200);
    expect(dev.body.current).toBeNull();
    expect(dev.body.history).toEqual([]);
    expect(dev.body.notes).toEqual([]);
  });

  it("saves a full skill rating and reflects it as the current snapshot", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Devon" });

    const rate = await agent
      .post(`/api/players/${player.body.id}/skill-ratings`)
      .send(fullRating({ shooting: 8, defense: 3 }));
    expect(rate.status).toBe(201);
    expect(rate.body.current).toMatchObject({ shooting: 8, dribbling: 5, defense: 3, passing: 5, conditioning: 5 });
    expect(rate.body.history).toHaveLength(5);
  });

  it("keeps every past rating in history but reports only the latest as current", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Casey" });

    await agent.post(`/api/players/${player.body.id}/skill-ratings`).send(fullRating({ shooting: 3 }));
    const second = await agent.post(`/api/players/${player.body.id}/skill-ratings`).send(fullRating({ shooting: 9 }));

    expect(second.body.current.shooting).toBe(9);
    expect(second.body.history).toHaveLength(10);
    expect(second.body.history.filter((h: { category: string }) => h.category === "shooting")).toHaveLength(2);
  });

  it("rejects a rating outside 1-10 or missing a category", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Riley" });

    const tooHigh = await agent.post(`/api/players/${player.body.id}/skill-ratings`).send(fullRating({ shooting: 11 }));
    expect(tooHigh.status).toBe(400);

    const missing = await agent.post(`/api/players/${player.body.id}/skill-ratings`).send({ shooting: 5 });
    expect(missing.status).toBe(400);
  });

  it("adds and deletes coach notes", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Morgan" });

    const add = await agent.post(`/api/players/${player.body.id}/notes`).send({ content: "Great hustle in practice." });
    expect(add.status).toBe(201);
    expect(add.body.content).toBe("Great hustle in practice.");

    const dev = await agent.get(`/api/players/${player.body.id}/development`);
    expect(dev.body.notes).toHaveLength(1);

    const del = await agent.delete(`/api/players/${player.body.id}/notes/${add.body.id}`);
    expect(del.status).toBe(204);

    const devAfter = await agent.get(`/api/players/${player.body.id}/development`);
    expect(devAfter.body.notes).toHaveLength(0);
  });

  it("rejects an empty note", async () => {
    const agent = await signedInAgent(app);
    const player = await agent.post("/api/players").send({ name: "Avery" });

    const res = await agent.post(`/api/players/${player.body.id}/notes`).send({ content: "" });
    expect(res.status).toBe(400);
  });

  it("scopes development, ratings, and notes to the requesting team", async () => {
    const owner = await signedInAgent(app);
    const player = await owner.post("/api/players").send({ name: "Team A Player" });
    await owner.post(`/api/players/${player.body.id}/skill-ratings`).send(fullRating());
    const note = await owner.post(`/api/players/${player.body.id}/notes`).send({ content: "Owner's note" });

    const outsider = await signedInAgent(app);
    const devRes = await outsider.get(`/api/players/${player.body.id}/development`);
    expect(devRes.status).toBe(404);

    const rateRes = await outsider.post(`/api/players/${player.body.id}/skill-ratings`).send(fullRating());
    expect(rateRes.status).toBe(404);

    const noteRes = await outsider.post(`/api/players/${player.body.id}/notes`).send({ content: "Intruder" });
    expect(noteRes.status).toBe(404);

    const deleteRes = await outsider.delete(`/api/players/${player.body.id}/notes/${note.body.id}`);
    expect(deleteRes.status).toBe(404);
  });
});

describe("GET /api/players/skill-ratings (roster-wide current ratings)", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("omits players with no ratings and reports the latest snapshot for those that have one", async () => {
    const agent = await signedInAgent(app);
    const unrated = await agent.post("/api/players").send({ name: "Unrated" });
    const rated = await agent.post("/api/players").send({ name: "Rated" });
    await agent.post(`/api/players/${rated.body.id}/skill-ratings`).send(fullRating({ shooting: 4 }));
    await agent.post(`/api/players/${rated.body.id}/skill-ratings`).send(fullRating({ shooting: 9 }));

    const res = await agent.get("/api/players/skill-ratings");
    expect(res.status).toBe(200);
    expect(res.body[unrated.body.id]).toBeUndefined();
    expect(res.body[rated.body.id]).toMatchObject({ shooting: 9, dribbling: 5, defense: 5, passing: 5, conditioning: 5 });
  });

  it("scopes results to the requesting team, never leaking another team's ratings", async () => {
    const owner = await signedInAgent(app);
    const player = await owner.post("/api/players").send({ name: "Owner's Player" });
    await owner.post(`/api/players/${player.body.id}/skill-ratings`).send(fullRating());

    const outsider = await signedInAgent(app);
    const res = await outsider.get("/api/players/skill-ratings");
    expect(res.status).toBe(200);
    expect(res.body[player.body.id]).toBeUndefined();
  });
});
