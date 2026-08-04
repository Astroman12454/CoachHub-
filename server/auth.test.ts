// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { setupAuth, requireAuth } from "./auth";

// Real signup/login now write to the DB (accounts, teams, seeded exercises),
// so every test uses its own randomized email — no shared fixture account,
// no collisions with anything created manually in the same dev database.
function uniqueEmail() {
  return `test-${randomUUID()}@example.com`;
}
const PASSWORD = "correct-password-123";

function createTestApp() {
  const app = express();
  app.use(express.json());
  setupAuth(app);
  app.use("/api", requireAuth);
  app.get("/api/protected", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("auth", () => {
  let app: express.Express;

  beforeAll(() => {
    app = createTestApp();
  });

  it("GET /api/session reports unauthenticated with no session", async () => {
    const res = await request(app).get("/api/session");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authenticated: false });
  });

  it("blocks a protected route with 401 when there is no session", async () => {
    const res = await request(app).get("/api/protected");
    expect(res.status).toBe(401);
  });

  it("rejects signup with an invalid email", async () => {
    const res = await request(app).post("/api/signup").send({ email: "not-an-email", password: PASSWORD });
    expect(res.status).toBe(400);
  });

  it("rejects signup with a too-short password", async () => {
    const res = await request(app).post("/api/signup").send({ email: uniqueEmail(), password: "short" });
    expect(res.status).toBe(400);
  });

  it("signup creates an account with a default team, grants a session, and unlocks protected routes", async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();

    const signup = await agent.post("/api/signup").send({ email, password: PASSWORD });
    expect(signup.status).toBe(201);
    expect(signup.body.authenticated).toBe(true);
    expect(signup.body.account).toMatchObject({ email, plan: "free" });
    expect(signup.body.teams).toHaveLength(1);
    expect(signup.body.currentTeamId).toBe(signup.body.teams[0].id);

    const protectedRes = await agent.get("/api/protected");
    expect(protectedRes.status).toBe(200);
  });

  it("rejects signup with an email that's already registered", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/signup").send({ email, password: PASSWORD });

    const dupe = await request(app).post("/api/signup").send({ email, password: PASSWORD });
    expect(dupe.status).toBe(409);
  });

  it("rejects login with an incorrect password and does not grant a session", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/signup").send({ email, password: PASSWORD });

    const agent = request.agent(app);
    const login = await agent.post("/api/login").send({ email, password: "wrong-password" });
    expect(login.status).toBe(401);

    const protectedRes = await agent.get("/api/protected");
    expect(protectedRes.status).toBe(401);
  });

  it("rejects login for an email that was never registered", async () => {
    const res = await request(app).post("/api/login").send({ email: uniqueEmail(), password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it("logs in with correct credentials and logout destroys the session", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/signup").send({ email, password: PASSWORD });

    const agent = request.agent(app);
    const login = await agent.post("/api/login").send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.account).toMatchObject({ email });

    await agent.get("/api/protected").expect(200);

    const logout = await agent.post("/api/logout");
    expect(logout.status).toBe(200);
    expect(logout.body).toEqual({ authenticated: false });

    const protectedRes = await agent.get("/api/protected");
    expect(protectedRes.status).toBe(401);
  });
});

describe("auth rate limiting", () => {
  // A fresh app (and therefore a fresh rate-limit counter) per describe
  // block, so this doesn't get coupled to how many attempts the other
  // tests happen to make against a shared instance.
  it("locks out further login attempts after repeated failures, even with the correct password", async () => {
    const app = createTestApp();
    const email = uniqueEmail();
    await request(app).post("/api/signup").send({ email, password: PASSWORD });

    const agent = request.agent(app);
    for (let i = 0; i < 10; i++) {
      const res = await agent.post("/api/login").send({ email, password: "wrong" });
      expect(res.status).toBe(401);
    }

    const lockedOut = await agent.post("/api/login").send({ email, password: PASSWORD });
    expect(lockedOut.status).toBe(429);
  });
});
