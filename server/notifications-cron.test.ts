// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";

const { isPushConfiguredMock, sendPushNotificationsMock } = vi.hoisted(() => ({
  isPushConfiguredMock: vi.fn(),
  sendPushNotificationsMock: vi.fn(),
}));
vi.mock("./push", () => ({
  isPushConfigured: isPushConfiguredMock,
  sendPushNotifications: sendPushNotificationsMock,
  getVapidPublicKey: () => null,
}));

const { isEmailConfiguredMock, sendWeeklyDigestEmailMock, sendPasswordResetEmailMock } = vi.hoisted(() => ({
  isEmailConfiguredMock: vi.fn(),
  sendWeeklyDigestEmailMock: vi.fn(),
  sendPasswordResetEmailMock: vi.fn(),
}));
vi.mock("./email", () => ({
  isEmailConfigured: isEmailConfiguredMock,
  sendWeeklyDigestEmail: sendWeeklyDigestEmailMock,
  sendPasswordResetEmail: sendPasswordResetEmailMock,
}));

import { setupAuth, requireAuth } from "./auth";
import { registerRoutes } from "./routes";
import { storage } from "./storage";
import { runNotificationSweep } from "./notifications-cron";

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

async function currentTeamId(agent: request.Agent): Promise<number> {
  const session = await agent.get("/api/session");
  return session.body.currentTeamId;
}

// Formats a Date the way training-session date/time text columns store it.
function toDateTimeStrings(when: Date): { date: string; time: string } {
  const iso = when.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

function oneSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Practice",
    date: "2026-01-01",
    time: "17:00",
    duration: 60,
    exerciseIds: [],
    playIds: [],
    notes: null,
    ...overrides,
  };
}

describe("getSessionsNeedingReminder", () => {
  it("only returns sessions inside the reminder window that haven't been reminded and aren't cancelled", async () => {
    const app = await createTestApp();
    const { agent } = await signedInAgent(app);

    const inWindow = await agent.post("/api/training-sessions").send(oneSession({ name: "In window", ...toDateTimeStrings(new Date(Date.now() + 120 * 60 * 1000)) }));
    const tooSoon = await agent.post("/api/training-sessions").send(oneSession({ name: "Too soon", ...toDateTimeStrings(new Date(Date.now() + 30 * 60 * 1000)) }));
    const tooFar = await agent.post("/api/training-sessions").send(oneSession({ name: "Too far", ...toDateTimeStrings(new Date(Date.now() + 300 * 60 * 1000)) }));
    const alreadyReminded = await agent.post("/api/training-sessions").send(oneSession({ name: "Already reminded", ...toDateTimeStrings(new Date(Date.now() + 118 * 60 * 1000)) }));
    const cancelled = await agent.post("/api/training-sessions").send(oneSession({ name: "Cancelled", ...toDateTimeStrings(new Date(Date.now() + 122 * 60 * 1000)) }));
    await agent.put(`/api/training-sessions/${cancelled.body.id}`).send({ status: "cancelled" });
    await storage.markSessionReminderSent(alreadyReminded.body.id);

    const windowStart = new Date(Date.now() + 105 * 60 * 1000);
    const windowEnd = new Date(Date.now() + 135 * 60 * 1000);
    const due = await storage.getSessionsNeedingReminder(windowStart, windowEnd);
    const dueIds = due.map((s) => s.id);

    expect(dueIds).toContain(inWindow.body.id);
    expect(dueIds).not.toContain(tooSoon.body.id);
    expect(dueIds).not.toContain(tooFar.body.id);
    expect(dueIds).not.toContain(alreadyReminded.body.id);
    expect(dueIds).not.toContain(cancelled.body.id);
  });
});

describe("runNotificationSweep", () => {
  beforeEach(() => {
    isPushConfiguredMock.mockReset().mockReturnValue(false);
    isEmailConfiguredMock.mockReset().mockReturnValue(false);
    sendPushNotificationsMock.mockReset().mockResolvedValue({ sent: 0, expiredEndpoints: [] });
    sendWeeklyDigestEmailMock.mockReset().mockResolvedValue(undefined);
  });

  it("does nothing when neither push nor email is configured", async () => {
    const app = await createTestApp();
    const { agent } = await signedInAgent(app);
    const session = await agent.post("/api/training-sessions").send(oneSession(toDateTimeStrings(new Date(Date.now() + 120 * 60 * 1000))));

    const result = await runNotificationSweep();

    expect(result).toEqual({ remindersSent: 0, digestsSent: 0 });
    expect(sendPushNotificationsMock).not.toHaveBeenCalled();
    const stored = await storage.getTrainingSessionById(session.body.id, await currentTeamId(agent));
    expect(stored?.reminderSentAt).toBeNull();
  });

  // The sweep is intentionally global (every team, every account — see
  // storage.getSessionsNeedingReminder/getTeamsDueForWeeklyDigest), and
  // these tests run against the same shared dev database as every other
  // test file and the running dev server. Asserting an exact sweep-wide
  // remindersSent/digestsSent count would be flaky the moment any other
  // team happens to be due at the same time, so these check the specific
  // session/team this test created instead of the aggregate totals.
  it("sends a reminder for a session in the window and never sends it twice", async () => {
    isPushConfiguredMock.mockReturnValue(true);
    const app = await createTestApp();
    const { agent } = await signedInAgent(app);
    const teamId = await currentTeamId(agent);
    const created = await agent.post("/api/training-sessions").send(oneSession(toDateTimeStrings(new Date(Date.now() + 120 * 60 * 1000))));

    await runNotificationSweep();
    const afterFirst = await storage.getTrainingSessionById(created.body.id, teamId);
    expect(afterFirst?.reminderSentAt).not.toBeNull();

    const firstSentAt = afterFirst!.reminderSentAt;
    await runNotificationSweep();
    const afterSecond = await storage.getTrainingSessionById(created.body.id, teamId);
    expect(afterSecond?.reminderSentAt).toEqual(firstSentAt);
  });

  it("sends a weekly digest (push + email) to a due team, then isn't due again right away", async () => {
    isPushConfiguredMock.mockReturnValue(true);
    isEmailConfiguredMock.mockReturnValue(true);
    const app = await createTestApp();
    const { agent, email } = await signedInAgent(app);
    const session = await agent.get("/api/session");
    const teamId: number = session.body.currentTeamId;
    const accountId: number = session.body.account.id;

    await runNotificationSweep();
    expect(sendWeeklyDigestEmailMock).toHaveBeenCalledWith(email, expect.objectContaining({ teamName: "My Team" }));
    const teamsAfterFirst = await storage.getTeamsByAccount(accountId);
    expect(teamsAfterFirst.find((t) => t.id === teamId)?.lastWeeklyDigestAt).not.toBeNull();

    sendWeeklyDigestEmailMock.mockClear();
    await runNotificationSweep();
    expect(sendWeeklyDigestEmailMock).not.toHaveBeenCalledWith(email, expect.anything());
  });

  it("still marks the digest sent when email delivery throws, so it doesn't retry forever", async () => {
    isPushConfiguredMock.mockReturnValue(true);
    isEmailConfiguredMock.mockReturnValue(true);
    sendWeeklyDigestEmailMock.mockRejectedValueOnce(new Error("delivery failed"));
    const app = await createTestApp();
    const { agent, email } = await signedInAgent(app);

    await runNotificationSweep();
    expect(sendWeeklyDigestEmailMock).toHaveBeenCalledWith(email, expect.anything());

    sendWeeklyDigestEmailMock.mockClear();
    await runNotificationSweep();
    expect(sendWeeklyDigestEmailMock).not.toHaveBeenCalledWith(email, expect.anything());
  });
});

describe("POST /api/cron/notifications", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    isPushConfiguredMock.mockReset().mockReturnValue(false);
    isEmailConfiguredMock.mockReset().mockReturnValue(false);
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("returns 503 when CRON_SECRET isn't set", async () => {
    delete process.env.CRON_SECRET;
    const app = await createTestApp();
    const res = await request(app).post("/api/cron/notifications");
    expect(res.status).toBe(503);
  });

  it("returns 401 with a missing or wrong secret", async () => {
    process.env.CRON_SECRET = "the-real-secret";
    const app = await createTestApp();

    const missing = await request(app).post("/api/cron/notifications");
    expect(missing.status).toBe(401);

    const wrong = await request(app).post("/api/cron/notifications").set("x-cron-secret", "nope");
    expect(wrong.status).toBe(401);
  });

  it("runs the sweep and returns counts with the correct secret", async () => {
    process.env.CRON_SECRET = "the-real-secret";
    const app = await createTestApp();
    const res = await request(app).post("/api/cron/notifications").set("x-cron-secret", "the-real-secret");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ remindersSent: 0, digestsSent: 0 });
  });

  it("requires no session — unauthenticated requests still reach the handler", async () => {
    process.env.CRON_SECRET = "the-real-secret";
    const app = await createTestApp();
    const res = await request(app).post("/api/cron/notifications").query({ secret: "the-real-secret" });
    expect(res.status).toBe(200);
  });
});
