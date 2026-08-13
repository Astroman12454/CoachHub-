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

function playBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Horns Flare",
    category: "offense",
    courtType: "half",
    steps: [
      { tokens: [{ id: "o1", type: "offense", label: "1", x: 50, y: 90 }], drawings: [] },
      { tokens: [{ id: "o1", type: "offense", label: "1", x: 30, y: 60 }], drawings: [] },
    ],
    ...overrides,
  };
}

// Publishes a fresh play to the community under the given (paid) agent,
// setting a public name first since that's required to publish.
async function shareNewPlay(agent: request.Agent, overrides: Partial<Record<string, unknown>> = {}) {
  await agent.put("/api/account/public-name").send({ publicName: "Coach Plays" });
  const create = await agent.post("/api/plays").send(playBody(overrides));
  await agent.put(`/api/plays/${create.body.id}/share-community`).send({ shared: true });
  return create.body.id as number;
}

async function accountId(agent: request.Agent): Promise<number> {
  const res = await agent.get("/api/session");
  return res.body.account.id;
}

describe("play community sharing", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("toggles community sharing, requiring a public name first", async () => {
    const { agent } = await signedInPaidAgent(app);
    const create = await agent.post("/api/plays").send(playBody());

    const shareWithoutName = await agent.put(`/api/plays/${create.body.id}/share-community`).send({ shared: true });
    expect(shareWithoutName.status).toBe(409);
    expect(shareWithoutName.body.code).toBe("PUBLIC_NAME_REQUIRED");

    await agent.put("/api/account/public-name").send({ publicName: "Coach Plays" });
    const share = await agent.put(`/api/plays/${create.body.id}/share-community`).send({ shared: true });
    expect(share.status).toBe(200);
    expect(share.body.sharedToCommunity).toBe(1);

    const unshare = await agent.put(`/api/plays/${create.body.id}/share-community`).send({ shared: false });
    expect(unshare.status).toBe(200);
    expect(unshare.body.sharedToCommunity).toBe(0);
  });

  it("scopes sharing to the owning team — an outsider gets 404", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const create = await owner.post("/api/plays").send(playBody());

    const { agent: outsider } = await signedInAgent(app);
    const res = await outsider.put(`/api/plays/${create.body.id}/share-community`).send({ shared: true });
    expect(res.status).toBe(404);
  });

  it("lists shared plays with publishedBy resolved through the owning team's account", async () => {
    const playId = await shareNewPlay((await signedInPaidAgent(app)).agent, { name: "Community Horns" });

    const { agent: viewer } = await signedInAgent(app);
    const res = await viewer.get("/api/community-plays");
    expect(res.status).toBe(200);
    const found = res.body.find((p: { id: number }) => p.id === playId);
    expect(found).toMatchObject({ name: "Community Horns", category: "offense" });
    expect(found.publishedBy.publicName).toBe("Coach Plays");
    expect(found.accountId).toBeUndefined();
  });

  it("imports a community play as a fresh copy in the importer's own team, consuming a play slot like any other creation", async () => {
    const playId = await shareNewPlay((await signedInPaidAgent(app)).agent, { name: "Import Me" });

    const { agent: importer } = await signedInAgent(app);
    const imported = await importer.post(`/api/community-plays/${playId}/import`);
    expect(imported.status).toBe(201);
    expect(imported.body).toMatchObject({ name: "Import Me", category: "offense", sharedToCommunity: 0 });
    expect(imported.body.id).not.toBe(playId);

    const inPlaybook = await importer.get("/api/plays");
    expect(inPlaybook.body.map((p: { id: number }) => p.id)).toContain(imported.body.id);
  });

  it("respects the free plan's play-count cap when importing, same as creating a play from scratch", async () => {
    const playId = await shareNewPlay((await signedInPaidAgent(app)).agent, { name: "Capped Import" });

    const { agent: freeImporter } = await signedInAgent(app);
    // Free plan caps at 3 plays total — fill it up first.
    for (let i = 0; i < 3; i++) {
      await freeImporter.post("/api/plays").send(playBody({ name: `Filler ${i}` }));
    }

    const res = await freeImporter.post(`/api/community-plays/${playId}/import`);
    expect(res.status).toBe(403);
  });

  it("404s importing a play that isn't shared or doesn't exist", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const notShared = await owner.post("/api/plays").send(playBody());

    const { agent: importer } = await signedInAgent(app);
    const res = await importer.post(`/api/community-plays/${notShared.body.id}/import`);
    expect(res.status).toBe(404);

    const unknown = await importer.post("/api/community-plays/999999/import");
    expect(unknown.status).toBe(404);
  });
});

describe("play community likes", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("likes and unlikes a shared play, toggling likeCount and likedByMe", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const playId = await shareNewPlay(owner);

    const { agent: liker } = await signedInAgent(app);
    const like = await liker.post(`/api/community-plays/${playId}/like`);
    expect(like.status).toBe(204);

    const afterLike = await liker.get("/api/community-plays");
    expect(afterLike.body.find((p: { id: number }) => p.id === playId)).toMatchObject({ likeCount: 1, likedByMe: true });

    const unlike = await liker.delete(`/api/community-plays/${playId}/like`);
    expect(unlike.status).toBe(204);

    const afterUnlike = await liker.get("/api/community-plays");
    expect(afterUnlike.body.find((p: { id: number }) => p.id === playId)).toMatchObject({ likeCount: 0, likedByMe: false });
  });

  it("liking twice is idempotent", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const playId = await shareNewPlay(owner);

    const { agent: liker } = await signedInAgent(app);
    await liker.post(`/api/community-plays/${playId}/like`);
    await liker.post(`/api/community-plays/${playId}/like`);

    const res = await liker.get("/api/community-plays");
    expect(res.body.find((p: { id: number }) => p.id === playId).likeCount).toBe(1);
  });

  it("404s liking a play that isn't shared or doesn't exist", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const notShared = await owner.post("/api/plays").send(playBody());

    const { agent: liker } = await signedInAgent(app);
    const res = await liker.post(`/api/community-plays/${notShared.body.id}/like`);
    expect(res.status).toBe(404);
  });

  it("notifies the play's owning team's account on a new like, never for liking your own", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const playId = await shareNewPlay(owner, { name: "Notify Like Play" });

    const { agent: liker } = await signedInAgent(app);
    await liker.put("/api/account/public-name").send({ publicName: "Play Liker" });
    await liker.post(`/api/community-plays/${playId}/like`);

    const notifications = await owner.get("/api/notifications");
    expect(notifications.body.notifications[0]).toMatchObject({ type: "like_play", actorPublicName: "Play Liker", playName: "Notify Like Play" });

    await owner.post(`/api/community-plays/${playId}/like`);
    const afterSelfLike = await owner.get("/api/notifications");
    expect(afterSelfLike.body.unreadCount).toBe(notifications.body.unreadCount);
  });
});

describe("play community saves (bookmarks)", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("saves and unsaves a shared play, separate from liking", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const playId = await shareNewPlay(owner);

    const { agent: saver } = await signedInAgent(app);
    const save = await saver.post(`/api/community-plays/${playId}/save`);
    expect(save.status).toBe(204);

    const afterSave = await saver.get("/api/community-plays");
    const found = afterSave.body.find((p: { id: number }) => p.id === playId);
    expect(found.savedByMe).toBe(true);
    expect(found.likedByMe).toBe(false);

    const unsave = await saver.delete(`/api/community-plays/${playId}/save`);
    expect(unsave.status).toBe(204);

    const afterUnsave = await saver.get("/api/community-plays");
    expect(afterUnsave.body.find((p: { id: number }) => p.id === playId).savedByMe).toBe(false);
  });

  it("filters the community feed to only saved plays with ?saved=true, keeping unsaved ones out", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const savedId = await shareNewPlay(owner, { name: "Saved Play" });
    const unsavedId = await shareNewPlay(owner, { name: "Unsaved Play" });

    const { agent: saver } = await signedInAgent(app);
    await saver.post(`/api/community-plays/${savedId}/save`);

    const res = await saver.get("/api/community-plays?saved=true");
    const ids = res.body.map((p: { id: number }) => p.id);
    expect(ids).toContain(savedId);
    expect(ids).not.toContain(unsavedId);
  });

  it("saving twice is idempotent and never creates a notification", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const playId = await shareNewPlay(owner);

    const { agent: saver } = await signedInAgent(app);
    await saver.post(`/api/community-plays/${playId}/save`);
    await saver.post(`/api/community-plays/${playId}/save`);

    const notifications = await owner.get("/api/notifications");
    expect(notifications.body.unreadCount).toBe(0);
  });

  it("404s saving a play that isn't shared or doesn't exist", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const notShared = await owner.post("/api/plays").send(playBody());

    const { agent: saver } = await signedInAgent(app);
    const res = await saver.post(`/api/community-plays/${notShared.body.id}/save`);
    expect(res.status).toBe(404);
  });
});

describe("play comments", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("posts a comment and returns it with the author's public name", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const playId = await shareNewPlay(owner, { name: "Commented Play" });

    const { agent: commenter } = await signedInAgent(app);
    await commenter.put("/api/account/public-name").send({ publicName: "Play Commenter" });
    const res = await commenter.post(`/api/community-plays/${playId}/comments`).send({ body: "Nice set!" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ body: "Nice set!", publicName: "Play Commenter", canDelete: true });
  });

  it("requires a public name before commenting", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const playId = await shareNewPlay(owner, { name: "No Name Play" });

    const { agent: commenter } = await signedInAgent(app);
    const res = await commenter.post(`/api/community-plays/${playId}/comments`).send({ body: "Nice!" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PUBLIC_NAME_REQUIRED");
  });

  it("lets the comment's author or the play's owning team's account delete a comment, nobody else", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const playId = await shareNewPlay(owner, { name: "Moderated Play" });

    const { agent: commenter } = await signedInAgent(app);
    await commenter.put("/api/account/public-name").send({ publicName: "Moderated Commenter" });
    const create = await commenter.post(`/api/community-plays/${playId}/comments`).send({ body: "Rude comment" });

    const { agent: outsider } = await signedInAgent(app);
    const deniedDelete = await outsider.delete(`/api/community-plays/${playId}/comments/${create.body.id}`);
    expect(deniedDelete.status).toBe(404);

    const ownerDelete = await owner.delete(`/api/community-plays/${playId}/comments/${create.body.id}`);
    expect(ownerDelete.status).toBe(204);
  });

  it("notifies the play's owning team's account on a new comment, never for commenting on your own", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const playId = await shareNewPlay(owner, { name: "Notify Comment Play" });

    const { agent: commenter } = await signedInAgent(app);
    await commenter.put("/api/account/public-name").send({ publicName: "Notify Play Commenter" });
    await commenter.post(`/api/community-plays/${playId}/comments`).send({ body: "Nice" });

    const notifications = await owner.get("/api/notifications");
    expect(notifications.body.notifications[0]).toMatchObject({ type: "comment_play", actorPublicName: "Notify Play Commenter" });

    await owner.post(`/api/community-plays/${playId}/comments`).send({ body: "Thanks, self-comment" });
    const afterSelfComment = await owner.get("/api/notifications");
    expect(afterSelfComment.body.unreadCount).toBe(notifications.body.unreadCount);
  });

  it("reflects commentCount in the community plays list", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const playId = await shareNewPlay(owner, { name: "Comment Count Play" });

    const { agent: commenter } = await signedInAgent(app);
    await commenter.put("/api/account/public-name").send({ publicName: "Count Play Commenter" });
    await commenter.post(`/api/community-plays/${playId}/comments`).send({ body: "One" });
    await commenter.post(`/api/community-plays/${playId}/comments`).send({ body: "Two" });

    const res = await owner.get("/api/community-plays");
    expect(res.body.find((p: { id: number }) => p.id === playId).commentCount).toBe(2);
  });
});
