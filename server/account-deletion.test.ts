// @vitest-environment node
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { Pool } from "pg";
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

describe("DELETE /api/account", () => {
  it("requires an authenticated session", async () => {
    const app = await createTestApp();
    const res = await request(app).delete("/api/account").send({ password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it("rejects a missing password with 400", async () => {
    const app = await createTestApp();
    const { agent } = await signedInAgent(app);
    const res = await agent.delete("/api/account").send({});
    expect(res.status).toBe(400);
  });

  it("rejects the wrong password with 403 (not 401, so the client doesn't treat it as a logged-out session) and leaves the account intact", async () => {
    const app = await createTestApp();
    const { agent, email } = await signedInAgent(app);

    const res = await agent.delete("/api/account").send({ password: "not-the-password" });
    expect(res.status).toBe(403);

    // Still logged in, and the account can still log back in — nothing
    // was deleted.
    const sessionRes = await agent.get("/api/session");
    expect(sessionRes.body.authenticated).toBe(true);

    const loginRes = await request(app).post("/api/login").send({ email, password: PASSWORD });
    expect(loginRes.status).toBe(200);
  });

  it("deletes the account with the correct password, destroys the session, and frees the email for a new signup", async () => {
    const app = await createTestApp();
    const { agent, email } = await signedInAgent(app);

    const res = await agent.delete("/api/account").send({ password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });

    const protectedRes = await agent.get("/api/teams");
    expect(protectedRes.status).toBe(401);

    // The unique-email constraint would reject this if the row were still
    // there — the cleanest proof the cascade actually ran.
    const resignup = await request(app).post("/api/signup").send({ email, password: PASSWORD });
    expect(resignup.status).toBe(201);
  });

  it("blocks a club owner with active coaches from deleting, so they don't silently strand them", async () => {
    const app = await createTestApp();
    const { agent: ownerAgent, email: ownerEmail } = await signedInAgent(app);
    await setPlan(ownerEmail, "club");
    const { email: coachEmail } = await signedInAgent(app);

    // Email delivery isn't mocked in this file, so the membership is
    // created directly rather than round-tripping through the real invite
    // link — what's under test is the deletion block, not the invite flow
    // itself (already covered in coaches.test.ts).
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
      `INSERT INTO account_memberships (owner_account_id, member_account_id)
       SELECT o.id, m.id FROM accounts o, accounts m WHERE o.email = $1 AND m.email = $2`,
      [ownerEmail, coachEmail],
    );
    await pool.end();

    const deleteRes = await ownerAgent.delete("/api/account").send({ password: PASSWORD });
    expect(deleteRes.status).toBe(409);

    // Still there — the block didn't half-run anything.
    const sessionRes = await ownerAgent.get("/api/session");
    expect(sessionRes.body.authenticated).toBe(true);
  });
});
