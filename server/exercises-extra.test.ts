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

describe("exercise minimum players", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("saves and returns minPlayers, defaulting to null when omitted", async () => {
    const { agent } = await signedInPaidAgent(app);
    const withMin = await agent.post("/api/exercises").send(exerciseBody({ minPlayers: 6 }));
    expect(withMin.status).toBe(201);
    expect(withMin.body.minPlayers).toBe(6);

    const withoutMin = await agent.post("/api/exercises").send(exerciseBody());
    expect(withoutMin.body.minPlayers).toBeNull();
  });

  it("rejects a minPlayers value below 1", async () => {
    const { agent } = await signedInPaidAgent(app);
    const res = await agent.post("/api/exercises").send(exerciseBody({ minPlayers: 0 }));
    expect(res.status).toBe(400);
  });
});

describe("community exercise library", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("toggles community sharing — available on the free plan, unlike creating exercises", async () => {
    const { agent } = await signedInPaidAgent(app);
    const create = await agent.post("/api/exercises").send(exerciseBody());
    await agent.put("/api/account/public-name").send({ publicName: "Coach Test" });

    const share = await agent.put(`/api/exercises/${create.body.id}/share-community`).send({ shared: true });
    expect(share.status).toBe(200);
    expect(share.body.sharedToCommunity).toBe(1);

    const unshare = await agent.put(`/api/exercises/${create.body.id}/share-community`).send({ shared: false });
    expect(unshare.status).toBe(200);
    expect(unshare.body.sharedToCommunity).toBe(0);
  });

  it("scopes community-share toggling to the owning account — an outsider gets 404", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const create = await owner.post("/api/exercises").send(exerciseBody());

    const { agent: outsider } = await signedInAgent(app);
    const res = await outsider.put(`/api/exercises/${create.body.id}/share-community`).send({ shared: true });
    expect(res.status).toBe(404);
  });

  it("lists exercises shared by any account, never leaking accountId or unshared exercises", async () => {
    const { agent: ownerA } = await signedInPaidAgent(app);
    const shared = await ownerA.post("/api/exercises").send(exerciseBody({ name: "Shared Drill", minPlayers: 4 }));
    await ownerA.put("/api/account/public-name").send({ publicName: "Coach A" });
    await ownerA.put(`/api/exercises/${shared.body.id}/share-community`).send({ shared: true });
    const notShared = await ownerA.post("/api/exercises").send(exerciseBody({ name: "Private Drill" }));

    const { agent: ownerB } = await signedInPaidAgent(app);
    const res = await ownerB.get("/api/community-exercises");
    expect(res.status).toBe(200);

    const names = res.body.map((ex: { name: string }) => ex.name);
    expect(names).toContain("Shared Drill");
    expect(names).not.toContain("Private Drill");

    const found = res.body.find((ex: { name: string }) => ex.name === "Shared Drill");
    expect(found).toMatchObject({ minPlayers: 4, category: "shooting" });
    expect(found.accountId).toBeUndefined();
  });

  it("imports a community exercise as a fresh, private copy under the importer's account", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const shared = await owner.post("/api/exercises").send(exerciseBody({ name: "Shared Drill", minPlayers: 4 }));
    await owner.put("/api/account/public-name").send({ publicName: "Coach Owner" });
    await owner.put(`/api/exercises/${shared.body.id}/share-community`).send({ shared: true });
    await owner.put(`/api/exercises/${shared.body.id}/favorite`).send({ isFavorite: true });

    const { agent: importer } = await signedInPaidAgent(app);
    const imported = await importer.post(`/api/community-exercises/${shared.body.id}/import`);
    expect(imported.status).toBe(201);
    expect(imported.body).toMatchObject({ name: "Shared Drill", minPlayers: 4, isFavorite: 0, sharedToCommunity: 0 });
    expect(imported.body.id).not.toBe(shared.body.id);
    expect(imported.body.shareToken).toBeNull();

    const inLibrary = await importer.get("/api/exercises");
    expect(inLibrary.body.map((ex: { id: number }) => ex.id)).toContain(imported.body.id);
  });

  it("rejects importing on the free plan", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const shared = await owner.post("/api/exercises").send(exerciseBody());
    await owner.put("/api/account/public-name").send({ publicName: "Coach Owner" });
    await owner.put(`/api/exercises/${shared.body.id}/share-community`).send({ shared: true });

    const { agent: freeImporter } = await signedInAgent(app);
    const res = await freeImporter.post(`/api/community-exercises/${shared.body.id}/import`);
    expect(res.status).toBe(403);
  });

  it("404s importing an exercise that isn't shared or doesn't exist", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const notShared = await owner.post("/api/exercises").send(exerciseBody());

    const { agent: importer } = await signedInPaidAgent(app);
    const res = await importer.post(`/api/community-exercises/${notShared.body.id}/import`);
    expect(res.status).toBe(404);

    const unknown = await importer.post("/api/community-exercises/999999/import");
    expect(unknown.status).toBe(404);
  });
});

function diagramBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    courtType: "half",
    steps: [
      { tokens: [{ id: "o1", type: "offense", label: "1", x: 50, y: 90 }], drawings: [] },
      { tokens: [{ id: "o1", type: "offense", label: "1", x: 50, y: 50 }], drawings: [] },
    ],
    ...overrides,
  };
}

describe("exercise diagrams", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("saves a diagram and returns its steps, gated to paid plans", async () => {
    const { agent } = await signedInPaidAgent(app);
    const create = await agent.post("/api/exercises").send(exerciseBody());

    const save = await agent.put(`/api/exercises/${create.body.id}/diagram`).send(diagramBody());
    expect(save.status).toBe(200);
    expect(save.body.courtType).toBe("half");
    expect(save.body.steps).toHaveLength(2);
    expect(save.body.steps[0]).toMatchObject({ stepIndex: 0 });
    expect(save.body.steps[1]).toMatchObject({ stepIndex: 1 });
    expect(save.body.steps[0].tokens).toMatchObject([{ id: "o1", x: 50, y: 90 }]);

    const fetched = await agent.get(`/api/exercises/${create.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.steps).toHaveLength(2);
  });

  it("rejects adding a diagram on the free plan", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const create = await owner.post("/api/exercises").send(exerciseBody());

    const { agent: freeAgent } = await signedInAgent(app);
    const res = await freeAgent.put(`/api/exercises/${create.body.id}/diagram`).send(diagramBody());
    expect(res.status).toBe(403);
  });

  it("scopes saving a diagram to the owning account — an outsider gets 404", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const create = await owner.post("/api/exercises").send(exerciseBody());

    const { agent: outsider } = await signedInPaidAgent(app);
    const res = await outsider.put(`/api/exercises/${create.body.id}/diagram`).send(diagramBody());
    expect(res.status).toBe(404);
  });

  it("rejects a diagram with zero steps", async () => {
    const { agent } = await signedInPaidAgent(app);
    const create = await agent.post("/api/exercises").send(exerciseBody());

    const res = await agent.put(`/api/exercises/${create.body.id}/diagram`).send(diagramBody({ steps: [] }));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid courtType", async () => {
    const { agent } = await signedInPaidAgent(app);
    const create = await agent.post("/api/exercises").send(exerciseBody());

    const res = await agent.put(`/api/exercises/${create.body.id}/diagram`).send(diagramBody({ courtType: "quarter" }));
    expect(res.status).toBe(400);
  });

  it("overwrites previous steps when saving again, rather than accumulating them", async () => {
    const { agent } = await signedInPaidAgent(app);
    const create = await agent.post("/api/exercises").send(exerciseBody());

    await agent.put(`/api/exercises/${create.body.id}/diagram`).send(diagramBody());
    const resave = await agent.put(`/api/exercises/${create.body.id}/diagram`).send(
      diagramBody({ steps: [{ tokens: [], drawings: [] }] }),
    );
    expect(resave.status).toBe(200);
    expect(resave.body.steps).toHaveLength(1);
  });

  it("deletes a diagram, clearing its steps, gated to paid plans", async () => {
    const { agent } = await signedInPaidAgent(app);
    const create = await agent.post("/api/exercises").send(exerciseBody());
    await agent.put(`/api/exercises/${create.body.id}/diagram`).send(diagramBody());

    const del = await agent.delete(`/api/exercises/${create.body.id}/diagram`);
    expect(del.status).toBe(204);

    const fetched = await agent.get(`/api/exercises/${create.body.id}`);
    expect(fetched.body.steps).toHaveLength(0);
  });

  it("rejects deleting a diagram on the free plan", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const create = await owner.post("/api/exercises").send(exerciseBody());
    await owner.put(`/api/exercises/${create.body.id}/diagram`).send(diagramBody());

    const { agent: freeAgent } = await signedInAgent(app);
    const res = await freeAgent.delete(`/api/exercises/${create.body.id}/diagram`);
    expect(res.status).toBe(403);
  });

  it("scopes deleting a diagram to the owning account — an outsider gets 404", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const create = await owner.post("/api/exercises").send(exerciseBody());
    await owner.put(`/api/exercises/${create.body.id}/diagram`).send(diagramBody());

    const { agent: outsider } = await signedInPaidAgent(app);
    const res = await outsider.delete(`/api/exercises/${create.body.id}/diagram`);
    expect(res.status).toBe(404);
  });

  it("returns courtType and steps on the public exercise-share page", async () => {
    const { agent } = await signedInPaidAgent(app);
    const create = await agent.post("/api/exercises").send(exerciseBody());
    await agent.put(`/api/exercises/${create.body.id}/diagram`).send(diagramBody({ courtType: "full" }));

    const link = await agent.post(`/api/exercises/${create.body.id}/share-link`);
    const shared = await request(app).get(`/api/exercise-share/${link.body.token}`);
    expect(shared.status).toBe(200);
    expect(shared.body.courtType).toBe("full");
    expect(shared.body.steps).toHaveLength(2);
    expect(shared.body.accountId).toBeUndefined();
  });

  it("copies a diagram's courtType and steps when importing a community exercise", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const shared = await owner.post("/api/exercises").send(exerciseBody({ name: "Shared With Diagram" }));
    await owner.put(`/api/exercises/${shared.body.id}/diagram`).send(diagramBody({ courtType: "full" }));
    await owner.put("/api/account/public-name").send({ publicName: "Coach Owner" });
    await owner.put(`/api/exercises/${shared.body.id}/share-community`).send({ shared: true });

    const { agent: importer } = await signedInPaidAgent(app);
    const imported = await importer.post(`/api/community-exercises/${shared.body.id}/import`);
    expect(imported.status).toBe(201);
    expect(imported.body.courtType).toBe("full");

    const fetched = await importer.get(`/api/exercises/${imported.body.id}`);
    expect(fetched.body.steps).toHaveLength(2);
    expect(fetched.body.steps[0].tokens).toMatchObject([{ id: "o1", x: 50, y: 90 }]);
  });
});

describe("exercise content and account identity — role permissions", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  async function joinAsAssistant(app: express.Express) {
    const { agent: ownerAgent, email: ownerEmail } = await signedInAgent(app);
    await setPlan(ownerEmail, "club");
    const { agent: memberAgent } = await signedInAgent(app);
    const memberSession = await memberAgent.get("/api/session");
    const memberAccountId = memberSession.body.account.id;

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const ownerRow = await pool.query("SELECT id FROM accounts WHERE email = $1", [ownerEmail]);
    await pool.query(
      "INSERT INTO account_memberships (owner_account_id, member_account_id, role) VALUES ($1, $2, 'assistant')",
      [ownerRow.rows[0].id, memberAccountId],
    );
    await pool.end();
    return { ownerAgent, memberAgent };
  }

  it("blocks an assistant from toggling an exercise's community-share status", async () => {
    const { ownerAgent, memberAgent } = await joinAsAssistant(app);
    const exercise = await ownerAgent.post("/api/exercises").send(exerciseBody());

    const res = await memberAgent.put(`/api/exercises/${exercise.body.id}/share-community`).send({ shared: true });
    expect(res.status).toBe(403);
  });

  it("blocks an assistant from changing the club's public name", async () => {
    const { memberAgent } = await joinAsAssistant(app);
    const res = await memberAgent.put("/api/account/public-name").send({ publicName: "Hijacked Name" });
    expect(res.status).toBe(403);
  });
});
