// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { setupAuth, requireAuth } from "./auth";
import { registerRoutes } from "./routes";
import { storage } from "./storage";

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

describe("coach-to-coach referrals", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("lazily generates a stable referral code and starts with zero referrals", async () => {
    const { agent } = await signedInAgent(app);
    const first = await agent.get("/api/account/referrals");
    expect(first.status).toBe(200);
    expect(first.body.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
    expect(first.body.totalReferred).toBe(0);
    expect(first.body.totalConverted).toBe(0);
    expect(first.body.referrals).toEqual([]);

    const second = await agent.get("/api/account/referrals");
    expect(second.body.code).toBe(first.body.code);
  });

  it("attributes a signup that includes a valid ref code", async () => {
    const { agent: referrerAgent } = await signedInAgent(app);
    const codeRes = await referrerAgent.get("/api/account/referrals");
    const code = codeRes.body.code;

    const referredEmail = uniqueEmail();
    const signupRes = await request(app).post("/api/signup").send({ email: referredEmail, password: PASSWORD, ref: code });
    expect(signupRes.status).toBe(201);

    const stats = await referrerAgent.get("/api/account/referrals");
    expect(stats.body.totalReferred).toBe(1);
    expect(stats.body.totalConverted).toBe(0);
    expect(stats.body.referrals[0]).toMatchObject({ email: referredEmail, convertedAt: null });
  });

  it("silently ignores an unknown ref code instead of failing the signup", async () => {
    const res = await request(app).post("/api/signup").send({ email: uniqueEmail(), password: PASSWORD, ref: "NOTREAL1" });
    expect(res.status).toBe(201);
  });

  it("marks a first-time conversion and returns the referrer's id, but not on a second call", async () => {
    const { agent: referrerAgent } = await signedInAgent(app);
    const referrerSession = await referrerAgent.get("/api/session");
    const referrerId = referrerSession.body.account.id;

    const { agent: referredAgent } = await signedInAgent(app);
    const referredSession = await referredAgent.get("/api/session");
    const referredId = referredSession.body.account.id;
    await storage.setReferredBy(referredId, referrerId);

    const first = await storage.markReferralConvertedIfFirstTime(referredId);
    expect(first).toBe(referrerId);

    const second = await storage.markReferralConvertedIfFirstTime(referredId);
    expect(second).toBeNull();

    const stats = await referrerAgent.get("/api/account/referrals");
    expect(stats.body.totalConverted).toBe(1);
    expect(stats.body.referrals[0].convertedAt).not.toBeNull();
  });

  it("returns null for an account that was never referred by anyone", async () => {
    const { agent } = await signedInAgent(app);
    const session = await agent.get("/api/session");
    const result = await storage.markReferralConvertedIfFirstTime(session.body.account.id);
    expect(result).toBeNull();
  });
});
