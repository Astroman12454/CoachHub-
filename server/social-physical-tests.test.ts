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
  return { agent, email };
}

function testBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Sprint 3x Court",
    unit: "seconds",
    lowerIsBetter: 1,
    description: "Three full-court sprints, best time",
    ...overrides,
  };
}

// Publishes a fresh physical test to the community under the given agent,
// setting a public name first since that's required to publish. No plan
// gate applies — creating/importing physical tests is free on every plan.
async function shareNewTest(agent: request.Agent, overrides: Partial<Record<string, unknown>> = {}) {
  await agent.put("/api/account/public-name").send({ publicName: "Coach Fitness" });
  const create = await agent.post("/api/physical-tests").send(testBody(overrides));
  await agent.put(`/api/physical-tests/${create.body.id}/share-community`).send({ shared: true });
  return create.body.id as number;
}

describe("physical test community sharing", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("toggles community sharing, requiring a public name first", async () => {
    const { agent } = await signedInAgent(app);
    const create = await agent.post("/api/physical-tests").send(testBody());

    const shareWithoutName = await agent.put(`/api/physical-tests/${create.body.id}/share-community`).send({ shared: true });
    expect(shareWithoutName.status).toBe(409);
    expect(shareWithoutName.body.code).toBe("PUBLIC_NAME_REQUIRED");

    await agent.put("/api/account/public-name").send({ publicName: "Coach Fitness" });
    const share = await agent.put(`/api/physical-tests/${create.body.id}/share-community`).send({ shared: true });
    expect(share.status).toBe(200);
    expect(share.body.sharedToCommunity).toBe(1);

    const unshare = await agent.put(`/api/physical-tests/${create.body.id}/share-community`).send({ shared: false });
    expect(unshare.status).toBe(200);
    expect(unshare.body.sharedToCommunity).toBe(0);
  });

  it("scopes sharing to the owning account — an outsider gets 404", async () => {
    const { agent: owner } = await signedInAgent(app);
    const create = await owner.post("/api/physical-tests").send(testBody());

    const { agent: outsider } = await signedInAgent(app);
    const res = await outsider.put(`/api/physical-tests/${create.body.id}/share-community`).send({ shared: true });
    expect(res.status).toBe(404);
  });

  it("lists shared tests with publishedBy resolved to the owner's public name", async () => {
    const testId = await shareNewTest((await signedInAgent(app)).agent, { name: "Community Sprint" });

    const { agent: viewer } = await signedInAgent(app);
    const res = await viewer.get("/api/community-physical-tests");
    expect(res.status).toBe(200);
    const found = res.body.find((t: { id: number }) => t.id === testId);
    expect(found).toMatchObject({ name: "Community Sprint", unit: "seconds" });
    expect(found.publishedBy.publicName).toBe("Coach Fitness");
    expect(found.accountId).toBeUndefined();
  });

  it("imports a community test as a fresh copy — free on every plan, no capacity limit", async () => {
    const testId = await shareNewTest((await signedInAgent(app)).agent, { name: "Import Me" });

    const { agent: importer } = await signedInAgent(app);
    const imported = await importer.post(`/api/community-physical-tests/${testId}/import`);
    expect(imported.status).toBe(201);
    expect(imported.body).toMatchObject({ name: "Import Me", unit: "seconds", sharedToCommunity: 0 });
    expect(imported.body.id).not.toBe(testId);

    const inLibrary = await importer.get("/api/physical-tests");
    expect(inLibrary.body.map((t: { id: number }) => t.id)).toContain(imported.body.id);
  });

  it("404s importing a test that isn't shared or doesn't exist", async () => {
    const { agent: owner } = await signedInAgent(app);
    const notShared = await owner.post("/api/physical-tests").send(testBody());

    const { agent: importer } = await signedInAgent(app);
    const res = await importer.post(`/api/community-physical-tests/${notShared.body.id}/import`);
    expect(res.status).toBe(404);

    const unknown = await importer.post("/api/community-physical-tests/999999/import");
    expect(unknown.status).toBe(404);
  });
});

describe("physical test community likes", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("likes and unlikes a shared test, toggling likeCount and likedByMe", async () => {
    const { agent: owner } = await signedInAgent(app);
    const testId = await shareNewTest(owner);

    const { agent: liker } = await signedInAgent(app);
    const like = await liker.post(`/api/community-physical-tests/${testId}/like`);
    expect(like.status).toBe(204);

    const afterLike = await liker.get("/api/community-physical-tests");
    expect(afterLike.body.find((t: { id: number }) => t.id === testId)).toMatchObject({ likeCount: 1, likedByMe: true });

    const unlike = await liker.delete(`/api/community-physical-tests/${testId}/like`);
    expect(unlike.status).toBe(204);

    const afterUnlike = await liker.get("/api/community-physical-tests");
    expect(afterUnlike.body.find((t: { id: number }) => t.id === testId)).toMatchObject({ likeCount: 0, likedByMe: false });
  });

  it("404s liking a test that isn't shared or doesn't exist", async () => {
    const { agent: owner } = await signedInAgent(app);
    const notShared = await owner.post("/api/physical-tests").send(testBody());

    const { agent: liker } = await signedInAgent(app);
    const res = await liker.post(`/api/community-physical-tests/${notShared.body.id}/like`);
    expect(res.status).toBe(404);
  });

  it("notifies the test's owner on a new like, never for liking your own", async () => {
    const { agent: owner } = await signedInAgent(app);
    const testId = await shareNewTest(owner, { name: "Notify Like Test" });

    const { agent: liker } = await signedInAgent(app);
    await liker.put("/api/account/public-name").send({ publicName: "Test Liker" });
    await liker.post(`/api/community-physical-tests/${testId}/like`);

    const notifications = await owner.get("/api/notifications");
    expect(notifications.body.notifications[0]).toMatchObject({ type: "like_physical_test", actorPublicName: "Test Liker", physicalTestName: "Notify Like Test" });

    await owner.post(`/api/community-physical-tests/${testId}/like`);
    const afterSelfLike = await owner.get("/api/notifications");
    expect(afterSelfLike.body.unreadCount).toBe(notifications.body.unreadCount);
  });
});

describe("physical test community saves (bookmarks)", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("saves and unsaves a shared test, separate from liking", async () => {
    const { agent: owner } = await signedInAgent(app);
    const testId = await shareNewTest(owner);

    const { agent: saver } = await signedInAgent(app);
    const save = await saver.post(`/api/community-physical-tests/${testId}/save`);
    expect(save.status).toBe(204);

    const afterSave = await saver.get("/api/community-physical-tests");
    const found = afterSave.body.find((t: { id: number }) => t.id === testId);
    expect(found.savedByMe).toBe(true);
    expect(found.likedByMe).toBe(false);

    const unsave = await saver.delete(`/api/community-physical-tests/${testId}/save`);
    expect(unsave.status).toBe(204);

    const afterUnsave = await saver.get("/api/community-physical-tests");
    expect(afterUnsave.body.find((t: { id: number }) => t.id === testId).savedByMe).toBe(false);
  });

  it("filters the community feed to only saved tests with ?saved=true", async () => {
    const { agent: owner } = await signedInAgent(app);
    const savedId = await shareNewTest(owner, { name: "Saved Test" });
    const unsavedId = await shareNewTest(owner, { name: "Unsaved Test" });

    const { agent: saver } = await signedInAgent(app);
    await saver.post(`/api/community-physical-tests/${savedId}/save`);

    const res = await saver.get("/api/community-physical-tests?saved=true");
    const ids = res.body.map((t: { id: number }) => t.id);
    expect(ids).toContain(savedId);
    expect(ids).not.toContain(unsavedId);
  });

  it("404s saving a test that isn't shared or doesn't exist", async () => {
    const { agent: owner } = await signedInAgent(app);
    const notShared = await owner.post("/api/physical-tests").send(testBody());

    const { agent: saver } = await signedInAgent(app);
    const res = await saver.post(`/api/community-physical-tests/${notShared.body.id}/save`);
    expect(res.status).toBe(404);
  });
});

describe("physical test comments", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("posts a comment and returns it with the author's public name", async () => {
    const { agent: owner } = await signedInAgent(app);
    const testId = await shareNewTest(owner, { name: "Commented Test" });

    const { agent: commenter } = await signedInAgent(app);
    await commenter.put("/api/account/public-name").send({ publicName: "Test Commenter" });
    const res = await commenter.post(`/api/community-physical-tests/${testId}/comments`).send({ body: "Good test!" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ body: "Good test!", publicName: "Test Commenter", canDelete: true });
  });

  it("requires a public name before commenting", async () => {
    const { agent: owner } = await signedInAgent(app);
    const testId = await shareNewTest(owner, { name: "No Name Test" });

    const { agent: commenter } = await signedInAgent(app);
    const res = await commenter.post(`/api/community-physical-tests/${testId}/comments`).send({ body: "Nice!" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PUBLIC_NAME_REQUIRED");
  });

  it("lets the comment's author or the test's owner delete a comment, nobody else", async () => {
    const { agent: owner } = await signedInAgent(app);
    const testId = await shareNewTest(owner, { name: "Moderated Test" });

    const { agent: commenter } = await signedInAgent(app);
    await commenter.put("/api/account/public-name").send({ publicName: "Moderated Test Commenter" });
    const create = await commenter.post(`/api/community-physical-tests/${testId}/comments`).send({ body: "Rude comment" });

    const { agent: outsider } = await signedInAgent(app);
    const deniedDelete = await outsider.delete(`/api/community-physical-tests/${testId}/comments/${create.body.id}`);
    expect(deniedDelete.status).toBe(404);

    const ownerDelete = await owner.delete(`/api/community-physical-tests/${testId}/comments/${create.body.id}`);
    expect(ownerDelete.status).toBe(204);
  });

  it("notifies the test's owner on a new comment, never for commenting on your own", async () => {
    const { agent: owner } = await signedInAgent(app);
    const testId = await shareNewTest(owner, { name: "Notify Comment Test" });

    const { agent: commenter } = await signedInAgent(app);
    await commenter.put("/api/account/public-name").send({ publicName: "Notify Test Commenter" });
    await commenter.post(`/api/community-physical-tests/${testId}/comments`).send({ body: "Nice" });

    const notifications = await owner.get("/api/notifications");
    expect(notifications.body.notifications[0]).toMatchObject({ type: "comment_physical_test", actorPublicName: "Notify Test Commenter" });

    await owner.post(`/api/community-physical-tests/${testId}/comments`).send({ body: "Thanks, self-comment" });
    const afterSelfComment = await owner.get("/api/notifications");
    expect(afterSelfComment.body.unreadCount).toBe(notifications.body.unreadCount);
  });

  it("reflects commentCount in the community physical tests list", async () => {
    const { agent: owner } = await signedInAgent(app);
    const testId = await shareNewTest(owner, { name: "Comment Count Test" });

    const { agent: commenter } = await signedInAgent(app);
    await commenter.put("/api/account/public-name").send({ publicName: "Count Test Commenter" });
    await commenter.post(`/api/community-physical-tests/${testId}/comments`).send({ body: "One" });
    await commenter.post(`/api/community-physical-tests/${testId}/comments`).send({ body: "Two" });

    const res = await owner.get("/api/community-physical-tests");
    expect(res.body.find((t: { id: number }) => t.id === testId).commentCount).toBe(2);
  });
});
