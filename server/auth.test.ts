// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import { setupAuth, requireAuth } from "./auth";

// APP_PASSCODE is injected via vitest.config.ts's test.env before this file
// (and therefore ./auth, which reads it at import time) ever runs.
const PASSCODE = "test-passcode-12345";

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

  it("rejects an incorrect passcode with 401 and does not grant a session", async () => {
    const agent = request.agent(app);

    const login = await agent.post("/api/login").send({ passcode: "wrong-passcode" });
    expect(login.status).toBe(401);

    const protectedRes = await agent.get("/api/protected");
    expect(protectedRes.status).toBe(401);
  });

  it("rejects a missing/non-string passcode with 401 instead of throwing", async () => {
    const agent = request.agent(app);
    const login = await agent.post("/api/login").send({});
    expect(login.status).toBe(401);
  });

  it("accepts the correct passcode, grants a session, and unlocks protected routes", async () => {
    const agent = request.agent(app);

    const login = await agent.post("/api/login").send({ passcode: PASSCODE });
    expect(login.status).toBe(200);
    expect(login.body).toEqual({ authenticated: true });

    const session = await agent.get("/api/session");
    expect(session.body).toEqual({ authenticated: true });

    const protectedRes = await agent.get("/api/protected");
    expect(protectedRes.status).toBe(200);
    expect(protectedRes.body).toEqual({ ok: true });
  });

  it("logout destroys the session so protected routes are blocked again", async () => {
    const agent = request.agent(app);
    await agent.post("/api/login").send({ passcode: PASSCODE });
    await agent.get("/api/protected").expect(200);

    const logout = await agent.post("/api/logout");
    expect(logout.status).toBe(200);
    expect(logout.body).toEqual({ authenticated: false });

    const protectedRes = await agent.get("/api/protected");
    expect(protectedRes.status).toBe(401);
  });
});

describe("login rate limiting", () => {
  // A fresh app (and therefore a fresh rate-limit counter) per describe
  // block, so this doesn't get coupled to how many login attempts the
  // other tests happen to make against a shared instance.
  it("locks out further attempts after repeated failures, even with the correct passcode", async () => {
    const app = createTestApp();
    const agent = request.agent(app);

    for (let i = 0; i < 10; i++) {
      const res = await agent.post("/api/login").send({ passcode: "wrong" });
      expect(res.status).toBe(401);
    }

    const lockedOut = await agent.post("/api/login").send({ passcode: PASSCODE });
    expect(lockedOut.status).toBe(429);

    const session = await agent.get("/api/session");
    expect(session.body).toEqual({ authenticated: false });
  });
});
