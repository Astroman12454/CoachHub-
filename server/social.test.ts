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

  it("includes publishedBy (accountId + publicName) on shared exercises", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner);

    const { agent: viewer } = await signedInAgent(app);
    const res = await viewer.get("/api/community-exercises");
    const found = res.body.find((ex: { id: number }) => ex.id === exerciseId);
    expect(found.publishedBy).toMatchObject({ publicName: "Coach Social" });
    expect(typeof found.publishedBy.accountId).toBe("number");
  });
});

describe("following coaches", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  async function setPublicName(agent: request.Agent, name: string) {
    await agent.put("/api/account/public-name").send({ publicName: name });
  }

  async function accountId(agent: request.Agent): Promise<number> {
    const res = await agent.get("/api/session");
    return res.body.account.id;
  }

  it("follows and unfollows a coach, updating follower/following counts", async () => {
    const { agent: coach } = await signedInPaidAgent(app);
    await setPublicName(coach, "Coach Followed");
    const coachId = await accountId(coach);

    const { agent: fan } = await signedInAgent(app);
    const follow = await fan.post(`/api/coaches/${coachId}/follow`);
    expect(follow.status).toBe(204);

    const profile = await fan.get(`/api/coaches/${coachId}`);
    expect(profile.status).toBe(200);
    expect(profile.body).toMatchObject({ publicName: "Coach Followed", followerCount: 1, followedByMe: true });

    const unfollow = await fan.delete(`/api/coaches/${coachId}/follow`);
    expect(unfollow.status).toBe(204);

    const profileAfter = await fan.get(`/api/coaches/${coachId}`);
    expect(profileAfter.body).toMatchObject({ followerCount: 0, followedByMe: false });
  });

  it("rejects following yourself", async () => {
    const { agent: coach } = await signedInPaidAgent(app);
    await setPublicName(coach, "Coach Self");
    const coachId = await accountId(coach);

    const res = await coach.post(`/api/coaches/${coachId}/follow`);
    expect(res.status).toBe(400);
  });

  it("404s following or viewing an account with no public name set", async () => {
    const { agent: noName } = await signedInAgent(app);
    const noNameId = await accountId(noName);

    const { agent: fan } = await signedInAgent(app);
    const follow = await fan.post(`/api/coaches/${noNameId}/follow`);
    expect(follow.status).toBe(404);

    const profile = await fan.get(`/api/coaches/${noNameId}`);
    expect(profile.status).toBe(404);
  });

  it("404s following or viewing an account that doesn't exist", async () => {
    const { agent: fan } = await signedInAgent(app);
    const follow = await fan.post("/api/coaches/999999/follow");
    expect(follow.status).toBe(404);

    const profile = await fan.get("/api/coaches/999999");
    expect(profile.status).toBe(404);
  });

  it("following twice is idempotent — followerCount doesn't double-count", async () => {
    const { agent: coach } = await signedInPaidAgent(app);
    await setPublicName(coach, "Coach Idempotent");
    const coachId = await accountId(coach);

    const { agent: fan } = await signedInAgent(app);
    await fan.post(`/api/coaches/${coachId}/follow`);
    await fan.post(`/api/coaches/${coachId}/follow`);

    const profile = await fan.get(`/api/coaches/${coachId}`);
    expect(profile.body.followerCount).toBe(1);
  });

  it("unfollowing someone never followed is a harmless no-op", async () => {
    const { agent: coach } = await signedInPaidAgent(app);
    await setPublicName(coach, "Coach Never Followed");
    const coachId = await accountId(coach);

    const { agent: fan } = await signedInAgent(app);
    const res = await fan.delete(`/api/coaches/${coachId}/follow`);
    expect(res.status).toBe(204);
  });

  it("reports exerciseCount and followingCount on the profile", async () => {
    const { agent: coach } = await signedInPaidAgent(app);
    await shareNewExercise(coach, { name: "Followed Coach's Drill" });
    const coachId = await accountId(coach);

    const { agent: coach2 } = await signedInPaidAgent(app);
    await setPublicName(coach2, "Coach Two");
    const coach2Id = await accountId(coach2);
    await coach.post(`/api/coaches/${coach2Id}/follow`);

    const profile = await coach.get(`/api/coaches/${coachId}`);
    expect(profile.body.exerciseCount).toBeGreaterThanOrEqual(1);
    expect(profile.body.followingCount).toBe(1);
  });

  it("filters the community feed to only followed coaches with ?following=true", async () => {
    const { agent: followedCoach } = await signedInPaidAgent(app);
    const followedId = await shareNewExercise(followedCoach, { name: "Followed Feed Drill" });
    const followedCoachId = await accountId(followedCoach);

    const { agent: unfollowedCoach } = await signedInPaidAgent(app);
    const unfollowedId = await shareNewExercise(unfollowedCoach, { name: "Unfollowed Feed Drill" });

    const { agent: fan } = await signedInAgent(app);
    await fan.post(`/api/coaches/${followedCoachId}/follow`);

    const res = await fan.get("/api/community-exercises?following=true");
    const ids = res.body.map((ex: { id: number }) => ex.id);
    expect(ids).toContain(followedId);
    expect(ids).not.toContain(unfollowedId);
  });
});

describe("notifications", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  async function accountId(agent: request.Agent): Promise<number> {
    const res = await agent.get("/api/session");
    return res.body.account.id;
  }

  it("notifies a coach when someone follows them", async () => {
    const { agent: coach } = await signedInPaidAgent(app);
    await coach.put("/api/account/public-name").send({ publicName: "Coach Followed" });
    const coachId = await accountId(coach);

    const { agent: fan } = await signedInAgent(app);
    await fan.put("/api/account/public-name").send({ publicName: "Fan Coach" });
    await fan.post(`/api/coaches/${coachId}/follow`);

    const res = await coach.get("/api/notifications");
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(1);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0]).toMatchObject({ type: "follow", actorPublicName: "Fan Coach", read: false });
  });

  it("following twice only notifies once", async () => {
    const { agent: coach } = await signedInPaidAgent(app);
    await coach.put("/api/account/public-name").send({ publicName: "Coach Idempotent Notify" });
    const coachId = await accountId(coach);

    const { agent: fan } = await signedInAgent(app);
    await fan.post(`/api/coaches/${coachId}/follow`);
    await fan.post(`/api/coaches/${coachId}/follow`);

    const res = await coach.get("/api/notifications");
    expect(res.body.unreadCount).toBe(1);
  });

  it("notifies the owner when someone else likes their exercise", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner, { name: "Liked Drill" });

    const { agent: liker } = await signedInAgent(app);
    await liker.put("/api/account/public-name").send({ publicName: "Liker Coach" });
    await liker.post(`/api/community-exercises/${exerciseId}/like`);

    const res = await owner.get("/api/notifications");
    expect(res.body.unreadCount).toBe(1);
    expect(res.body.notifications[0]).toMatchObject({ type: "like", actorPublicName: "Liker Coach", exerciseName: "Liked Drill", read: false });
  });

  it("never notifies for liking your own exercise", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner, { name: "Self Liked Drill" });
    await owner.post(`/api/community-exercises/${exerciseId}/like`);

    const res = await owner.get("/api/notifications");
    expect(res.body.unreadCount).toBe(0);
  });

  it("marks a single notification read, and mark-all clears the rest", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseA = await shareNewExercise(owner, { name: "Drill A" });
    const exerciseB = await shareNewExercise(owner, { name: "Drill B" });

    const { agent: liker } = await signedInAgent(app);
    await liker.post(`/api/community-exercises/${exerciseA}/like`);
    await liker.post(`/api/community-exercises/${exerciseB}/like`);

    const before = await owner.get("/api/notifications");
    expect(before.body.unreadCount).toBe(2);
    const firstId = before.body.notifications[0].id;

    const markOne = await owner.post(`/api/notifications/${firstId}/read`);
    expect(markOne.status).toBe(204);

    const afterOne = await owner.get("/api/notifications");
    expect(afterOne.body.unreadCount).toBe(1);

    const markAll = await owner.post("/api/notifications/read-all");
    expect(markAll.status).toBe(204);

    const afterAll = await owner.get("/api/notifications");
    expect(afterAll.body.unreadCount).toBe(0);
    expect(afterAll.body.notifications.every((n: { read: boolean }) => n.read)).toBe(true);
  });

  it("scopes notifications to the recipient — marking someone else's notification read is a silent no-op", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner, { name: "Scoped Drill" });

    const { agent: liker } = await signedInAgent(app);
    await liker.post(`/api/community-exercises/${exerciseId}/like`);

    const ownerNotifications = await owner.get("/api/notifications");
    const notificationId = ownerNotifications.body.notifications[0].id;

    const { agent: outsider } = await signedInAgent(app);
    const res = await outsider.post(`/api/notifications/${notificationId}/read`);
    expect(res.status).toBe(204);

    const stillUnread = await owner.get("/api/notifications");
    expect(stillUnread.body.unreadCount).toBe(1);
  });

  it("never leaks another account's notifications in the list", async () => {
    const { agent: coachA } = await signedInPaidAgent(app);
    await coachA.put("/api/account/public-name").send({ publicName: "Coach A Notify" });
    const coachAId = await accountId(coachA);

    const { agent: fan } = await signedInAgent(app);
    await fan.post(`/api/coaches/${coachAId}/follow`);

    const { agent: coachB } = await signedInAgent(app);
    const res = await coachB.get("/api/notifications");
    expect(res.body.notifications).toHaveLength(0);
    expect(res.body.unreadCount).toBe(0);
  });
});

describe("suggested coaches", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  async function accountId(agent: request.Agent): Promise<number> {
    const res = await agent.get("/api/session");
    return res.body.account.id;
  }

  it("suggests a coach who has published exercises", async () => {
    const { agent: publisher } = await signedInPaidAgent(app);
    await shareNewExercise(publisher, { name: "Suggested Drill" });
    const publisherId = await accountId(publisher);

    const { agent: viewer } = await signedInAgent(app);
    const res = await viewer.get("/api/coaches/suggested?limit=1000");
    expect(res.status).toBe(200);
    const suggestion = res.body.find((c: { accountId: number }) => c.accountId === publisherId);
    expect(suggestion).toMatchObject({ publicName: "Coach Social", exerciseCount: 1 });
  });

  it("never suggests yourself", async () => {
    const { agent: publisher } = await signedInPaidAgent(app);
    await shareNewExercise(publisher, { name: "Own Drill" });
    const publisherId = await accountId(publisher);

    const res = await publisher.get("/api/coaches/suggested");
    expect(res.body.find((c: { accountId: number }) => c.accountId === publisherId)).toBeUndefined();
  });

  it("excludes coaches the viewer already follows", async () => {
    const { agent: publisher } = await signedInPaidAgent(app);
    await shareNewExercise(publisher, { name: "Already Followed Drill" });
    const publisherId = await accountId(publisher);

    const { agent: viewer } = await signedInAgent(app);
    await viewer.post(`/api/coaches/${publisherId}/follow`);

    const res = await viewer.get("/api/coaches/suggested");
    expect(res.body.find((c: { accountId: number }) => c.accountId === publisherId)).toBeUndefined();
  });

  it("excludes coaches who haven't published anything, even with a public name set", async () => {
    const { agent: noPublications } = await signedInAgent(app);
    await noPublications.put("/api/account/public-name").send({ publicName: "Coach No Drills" });
    const noPublicationsId = await accountId(noPublications);

    const { agent: viewer } = await signedInAgent(app);
    const res = await viewer.get("/api/coaches/suggested");
    expect(res.body.find((c: { accountId: number }) => c.accountId === noPublicationsId)).toBeUndefined();
  });

  it("ranks by likeCount, then exerciseCount", async () => {
    const { agent: popular } = await signedInPaidAgent(app);
    const popularExerciseId = await shareNewExercise(popular, { name: "Popular Suggested Drill" });
    const popularId = await accountId(popular);

    const { agent: prolific } = await signedInPaidAgent(app);
    await shareNewExercise(prolific, { name: "Prolific Drill One" });
    await shareNewExercise(prolific, { name: "Prolific Drill Two" });
    const prolificId = await accountId(prolific);

    const { agent: liker } = await signedInAgent(app);
    await liker.post(`/api/community-exercises/${popularExerciseId}/like`);

    const { agent: viewer } = await signedInAgent(app);
    const res = await viewer.get("/api/coaches/suggested?limit=1000");
    const ids = res.body.map((c: { accountId: number }) => c.accountId);
    expect(ids.indexOf(popularId)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(prolificId)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(popularId)).toBeLessThan(ids.indexOf(prolificId));
  });
});

describe("exercise comments", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("posts a comment and returns it with the author's public name and canDelete true", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner, { name: "Commented Drill" });

    const { agent: commenter } = await signedInAgent(app);
    await commenter.put("/api/account/public-name").send({ publicName: "Commenter Coach" });
    const res = await commenter.post(`/api/community-exercises/${exerciseId}/comments`).send({ body: "Great drill!" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ body: "Great drill!", publicName: "Commenter Coach", canDelete: true });
  });

  it("requires a public name before commenting", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner, { name: "No Name Yet Drill" });

    const { agent: commenter } = await signedInAgent(app);
    const res = await commenter.post(`/api/community-exercises/${exerciseId}/comments`).send({ body: "Nice!" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PUBLIC_NAME_REQUIRED");
  });

  it("rejects an empty or overlong comment", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner, { name: "Validation Drill" });
    await owner.put("/api/account/public-name").send({ publicName: "Coach Social" });

    const empty = await owner.post(`/api/community-exercises/${exerciseId}/comments`).send({ body: "   " });
    expect(empty.status).toBe(400);

    const overlong = await owner.post(`/api/community-exercises/${exerciseId}/comments`).send({ body: "x".repeat(501) });
    expect(overlong.status).toBe(400);
  });

  it("404s commenting on an exercise that isn't shared or doesn't exist", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    await owner.put("/api/account/public-name").send({ publicName: "Coach Social" });
    const create = await owner.post("/api/exercises").send(exerciseBody({ name: "Unshared Drill" }));

    const res = await owner.post(`/api/community-exercises/${create.body.id}/comments`).send({ body: "Hi" });
    expect(res.status).toBe(404);

    const unknown = await owner.post("/api/community-exercises/999999/comments").send({ body: "Hi" });
    expect(unknown.status).toBe(404);
  });

  it("lists comments in chronological order, computing canDelete per viewer", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner, { name: "Thread Drill" });

    const { agent: commenter } = await signedInAgent(app);
    await commenter.put("/api/account/public-name").send({ publicName: "Thread Commenter" });
    await commenter.post(`/api/community-exercises/${exerciseId}/comments`).send({ body: "First!" });
    await commenter.post(`/api/community-exercises/${exerciseId}/comments`).send({ body: "Second!" });

    const asOwner = await owner.get(`/api/community-exercises/${exerciseId}/comments`);
    expect(asOwner.body.map((c: { body: string }) => c.body)).toEqual(["First!", "Second!"]);
    expect(asOwner.body.every((c: { canDelete: boolean }) => c.canDelete)).toBe(true);

    const asCommenter = await commenter.get(`/api/community-exercises/${exerciseId}/comments`);
    expect(asCommenter.body.every((c: { canDelete: boolean }) => c.canDelete)).toBe(true);

    const { agent: bystander } = await signedInAgent(app);
    const asBystander = await bystander.get(`/api/community-exercises/${exerciseId}/comments`);
    expect(asBystander.body.every((c: { canDelete: boolean }) => !c.canDelete)).toBe(true);
  });

  it("lets the comment's author delete their own comment", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner, { name: "Self Delete Drill" });

    const { agent: commenter } = await signedInAgent(app);
    await commenter.put("/api/account/public-name").send({ publicName: "Self Deleter" });
    const create = await commenter.post(`/api/community-exercises/${exerciseId}/comments`).send({ body: "Oops" });

    const res = await commenter.delete(`/api/community-exercises/${exerciseId}/comments/${create.body.id}`);
    expect(res.status).toBe(204);

    const remaining = await owner.get(`/api/community-exercises/${exerciseId}/comments`);
    expect(remaining.body).toHaveLength(0);
  });

  it("lets the exercise owner delete someone else's comment on their exercise", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner, { name: "Owner Moderates Drill" });

    const { agent: commenter } = await signedInAgent(app);
    await commenter.put("/api/account/public-name").send({ publicName: "Moderated Commenter" });
    const create = await commenter.post(`/api/community-exercises/${exerciseId}/comments`).send({ body: "Rude comment" });

    const res = await owner.delete(`/api/community-exercises/${exerciseId}/comments/${create.body.id}`);
    expect(res.status).toBe(204);
  });

  it("404s deleting a comment you neither wrote nor own the exercise for", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner, { name: "Protected Drill" });

    const { agent: commenter } = await signedInAgent(app);
    await commenter.put("/api/account/public-name").send({ publicName: "Protected Commenter" });
    const create = await commenter.post(`/api/community-exercises/${exerciseId}/comments`).send({ body: "Mine" });

    const { agent: outsider } = await signedInAgent(app);
    const res = await outsider.delete(`/api/community-exercises/${exerciseId}/comments/${create.body.id}`);
    expect(res.status).toBe(404);

    const stillThere = await owner.get(`/api/community-exercises/${exerciseId}/comments`);
    expect(stillThere.body).toHaveLength(1);
  });

  it("notifies the exercise owner when someone else comments, never for commenting on your own", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner, { name: "Notify Comment Drill" });

    const { agent: commenter } = await signedInAgent(app);
    await commenter.put("/api/account/public-name").send({ publicName: "Notify Commenter" });
    await commenter.post(`/api/community-exercises/${exerciseId}/comments`).send({ body: "Nice one" });

    const notifications = await owner.get("/api/notifications");
    expect(notifications.body.notifications[0]).toMatchObject({ type: "comment", actorPublicName: "Notify Commenter" });

    await owner.post(`/api/community-exercises/${exerciseId}/comments`).send({ body: "Thanks, self-comment" });
    const afterSelfComment = await owner.get("/api/notifications");
    expect(afterSelfComment.body.unreadCount).toBe(notifications.body.unreadCount);
  });

  it("reflects commentCount in the community exercises list", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner, { name: "Comment Count Drill" });

    const { agent: commenter } = await signedInAgent(app);
    await commenter.put("/api/account/public-name").send({ publicName: "Count Commenter" });
    await commenter.post(`/api/community-exercises/${exerciseId}/comments`).send({ body: "One" });
    await commenter.post(`/api/community-exercises/${exerciseId}/comments`).send({ body: "Two" });

    const res = await owner.get("/api/community-exercises");
    const found = res.body.find((ex: { id: number }) => ex.id === exerciseId);
    expect(found.commentCount).toBe(2);
  });
});

describe("community exercise saves (bookmarks)", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("saves and unsaves a shared exercise, separate from liking", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner);

    const { agent: saver } = await signedInAgent(app);
    const save = await saver.post(`/api/community-exercises/${exerciseId}/save`);
    expect(save.status).toBe(204);

    const afterSave = await saver.get("/api/community-exercises");
    const found = afterSave.body.find((ex: { id: number }) => ex.id === exerciseId);
    expect(found.savedByMe).toBe(true);
    expect(found.likedByMe).toBe(false);

    const unsave = await saver.delete(`/api/community-exercises/${exerciseId}/save`);
    expect(unsave.status).toBe(204);

    const afterUnsave = await saver.get("/api/community-exercises");
    expect(afterUnsave.body.find((ex: { id: number }) => ex.id === exerciseId).savedByMe).toBe(false);
  });

  it("filters the community feed to only saved exercises with ?saved=true", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const savedId = await shareNewExercise(owner, { name: "Saved Drill" });
    const unsavedId = await shareNewExercise(owner, { name: "Unsaved Drill" });

    const { agent: saver } = await signedInAgent(app);
    await saver.post(`/api/community-exercises/${savedId}/save`);

    const res = await saver.get("/api/community-exercises?saved=true");
    const ids = res.body.map((ex: { id: number }) => ex.id);
    expect(ids).toContain(savedId);
    expect(ids).not.toContain(unsavedId);
  });

  it("saving twice is idempotent and never creates a notification", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner);

    const { agent: saver } = await signedInAgent(app);
    await saver.post(`/api/community-exercises/${exerciseId}/save`);
    await saver.post(`/api/community-exercises/${exerciseId}/save`);

    const notifications = await owner.get("/api/notifications");
    expect(notifications.body.unreadCount).toBe(0);
  });

  it("404s saving an exercise that isn't shared or doesn't exist", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const notShared = await owner.post("/api/exercises").send(exerciseBody());

    const { agent: saver } = await signedInAgent(app);
    const res = await saver.post(`/api/community-exercises/${notShared.body.id}/save`);
    expect(res.status).toBe(404);
  });

  it("unsaving something never saved is a harmless no-op", async () => {
    const { agent: owner } = await signedInPaidAgent(app);
    const exerciseId = await shareNewExercise(owner);

    const { agent: saver } = await signedInAgent(app);
    const res = await saver.delete(`/api/community-exercises/${exerciseId}/save`);
    expect(res.status).toBe(204);
  });
});
