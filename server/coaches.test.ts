// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { Pool } from "pg";

const { isEmailConfiguredMock, sendCoachInviteEmailMock } = vi.hoisted(() => ({
  isEmailConfiguredMock: vi.fn(),
  sendCoachInviteEmailMock: vi.fn(),
}));
vi.mock("./email", () => ({
  isEmailConfigured: isEmailConfiguredMock,
  sendCoachInviteEmail: sendCoachInviteEmailMock,
}));

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

async function signedInClubAgent(app: express.Express) {
  const { agent, email } = await signedInAgent(app);
  await setPlan(email, "club");
  return { agent, email };
}

// Invites are emailed as a link containing the raw token (only its hash is
// stored) — capturing the mock's argument is the only way a test can get a
// token to accept with.
function tokenFromMockedInvite(): string {
  const acceptUrl = sendCoachInviteEmailMock.mock.calls.at(-1)?.[2] as string;
  return new URL(acceptUrl).searchParams.get("token")!;
}

describe("Club coach invites", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    isEmailConfiguredMock.mockReset().mockReturnValue(true);
    sendCoachInviteEmailMock.mockReset().mockResolvedValue(undefined);
  });

  it("blocks inviting on free or paid plans", async () => {
    const { agent: freeAgent } = await signedInAgent(app);
    const freeRes = await freeAgent.post("/api/coaches/invite").send({ email: uniqueEmail() });
    expect(freeRes.status).toBe(403);

    const { agent: paidAgent, email: paidEmail } = await signedInAgent(app);
    await setPlan(paidEmail, "paid");
    const paidRes = await paidAgent.post("/api/coaches/invite").send({ email: uniqueEmail() });
    expect(paidRes.status).toBe(403);
  });

  it("a club owner invites a coach, who shows up as a pending invite", async () => {
    const { agent } = await signedInClubAgent(app);
    const inviteEmail = uniqueEmail();

    const res = await agent.post("/api/coaches/invite").send({ email: inviteEmail });
    expect(res.status).toBe(201);
    expect(sendCoachInviteEmailMock).toHaveBeenCalledWith(inviteEmail, expect.any(String), expect.stringContaining("/accept-invite?token="));

    const list = await agent.get("/api/coaches");
    expect(list.status).toBe(200);
    expect(list.body.members).toEqual([]);
    expect(list.body.pendingInvites).toHaveLength(1);
    expect(list.body.pendingInvites[0].email).toBe(inviteEmail);
    expect(list.body.seatLimit).toBe(3);
  });

  it("rejects a duplicate invite to the same pending email", async () => {
    const { agent } = await signedInClubAgent(app);
    const inviteEmail = uniqueEmail();
    await agent.post("/api/coaches/invite").send({ email: inviteEmail });
    const dup = await agent.post("/api/coaches/invite").send({ email: inviteEmail });
    expect(dup.status).toBe(409);
  });

  it("enforces the seat limit across pending invites and accepted members combined", async () => {
    const { agent } = await signedInClubAgent(app);
    for (let i = 0; i < 3; i++) {
      const res = await agent.post("/api/coaches/invite").send({ email: uniqueEmail() });
      expect(res.status).toBe(201);
    }
    const overLimit = await agent.post("/api/coaches/invite").send({ email: uniqueEmail() });
    expect(overLimit.status).toBe(403);
  });

  it("a coach who already accepted an invite can't send new invites themselves", async () => {
    const { agent: ownerAgent } = await signedInClubAgent(app);
    const { agent: coachAgent, email: coachEmail } = await signedInAgent(app);
    await ownerAgent.post("/api/coaches/invite").send({ email: coachEmail });
    const token = tokenFromMockedInvite();
    await coachAgent.post(`/api/invites/${token}/accept`);

    const res = await coachAgent.post("/api/coaches/invite").send({ email: uniqueEmail() });
    expect(res.status).toBe(403);
  });

  describe("accepting an invite", () => {
    it("GET /api/invites/:token is public and returns who's inviting", async () => {
      const { agent: ownerAgent, email: ownerEmail } = await signedInClubAgent(app);
      const coachEmail = uniqueEmail();
      await ownerAgent.post("/api/coaches/invite").send({ email: coachEmail });
      const token = tokenFromMockedInvite();

      const res = await request(app).get(`/api/invites/${token}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe(coachEmail);
      expect(res.body.ownerEmail).toBe(ownerEmail);
    });

    it("404s for an unknown or already-expired token", async () => {
      const res = await request(app).get("/api/invites/not-a-real-token");
      expect(res.status).toBe(404);
    });

    it("requires the visitor to be logged in to accept", async () => {
      const { agent: ownerAgent } = await signedInClubAgent(app);
      await ownerAgent.post("/api/coaches/invite").send({ email: uniqueEmail() });
      const token = tokenFromMockedInvite();

      const res = await request(app).post(`/api/invites/${token}/accept`);
      expect(res.status).toBe(401);
    });

    it("rejects acceptance from an account whose email doesn't match the invite", async () => {
      const { agent: ownerAgent } = await signedInClubAgent(app);
      await ownerAgent.post("/api/coaches/invite").send({ email: uniqueEmail() });
      const token = tokenFromMockedInvite();

      const { agent: wrongAgent } = await signedInAgent(app);
      const res = await wrongAgent.post(`/api/invites/${token}/accept`);
      expect(res.status).toBe(403);
    });

    it("grants the accepting coach access to the owner's teams and shared exercise library", async () => {
      const { agent: ownerAgent } = await signedInClubAgent(app);
      const ownerTeams = await ownerAgent.get("/api/teams");
      const ownerTeamId = ownerTeams.body[0].id;
      const sharedExercise = await ownerAgent.post("/api/exercises").send({
        name: "Owner's Drill", description: "d", category: "shooting", duration: 10, difficulty: "easy",
      });
      expect(sharedExercise.status).toBe(201);

      const { agent: coachAgent, email: coachEmail } = await signedInAgent(app);
      await ownerAgent.post("/api/coaches/invite").send({ email: coachEmail });
      const token = tokenFromMockedInvite();
      const acceptRes = await coachAgent.post(`/api/invites/${token}/accept`);
      expect(acceptRes.status).toBe(200);

      const session = await coachAgent.get("/api/session");
      expect(session.body.account.plan).toBe("club");
      expect(session.body.account.isClubMember).toBe(true);
      expect(session.body.teams.map((t: { id: number }) => t.id)).toContain(ownerTeamId);

      const exercises = await coachAgent.get("/api/exercises");
      expect(exercises.body.some((e: { name: string }) => e.name === "Owner's Drill")).toBe(true);
    });

    it("consumes the invite — it can't be accepted twice", async () => {
      const { agent: ownerAgent } = await signedInClubAgent(app);
      const { agent: coachAgent, email: coachEmail } = await signedInAgent(app);
      await ownerAgent.post("/api/coaches/invite").send({ email: coachEmail });
      const token = tokenFromMockedInvite();

      await coachAgent.post(`/api/invites/${token}/accept`);
      const second = await coachAgent.post(`/api/invites/${token}/accept`);
      expect(second.status).toBe(404);
    });

    it("rejects accepting a second club when the account already belongs to one", async () => {
      const { agent: ownerAAgent } = await signedInClubAgent(app);
      const { agent: ownerBAgent } = await signedInClubAgent(app);
      const { agent: coachAgent, email: coachEmail } = await signedInAgent(app);

      await ownerAAgent.post("/api/coaches/invite").send({ email: coachEmail });
      const tokenA = tokenFromMockedInvite();
      await coachAgent.post(`/api/invites/${tokenA}/accept`);

      await ownerBAgent.post("/api/coaches/invite").send({ email: coachEmail });
      const tokenB = tokenFromMockedInvite();
      const res = await coachAgent.post(`/api/invites/${tokenB}/accept`);
      expect(res.status).toBe(409);
    });
  });

  describe("removing coaches", () => {
    it("the owner can revoke a pending invite", async () => {
      const { agent } = await signedInClubAgent(app);
      const invite = await agent.post("/api/coaches/invite").send({ email: uniqueEmail() });

      const del = await agent.delete(`/api/coaches/invites/${invite.body.id}`);
      expect(del.status).toBe(204);

      const list = await agent.get("/api/coaches");
      expect(list.body.pendingInvites).toEqual([]);
    });

    it("the owner can remove an accepted coach", async () => {
      const { agent: ownerAgent } = await signedInClubAgent(app);
      const { agent: coachAgent, email: coachEmail } = await signedInAgent(app);
      await ownerAgent.post("/api/coaches/invite").send({ email: coachEmail });
      const token = tokenFromMockedInvite();
      const accepted = await coachAgent.post(`/api/invites/${token}/accept`);
      void accepted;

      const listBefore = await ownerAgent.get("/api/coaches");
      const memberAccountId = listBefore.body.members[0].memberAccountId;

      const del = await ownerAgent.delete(`/api/coaches/${memberAccountId}`);
      expect(del.status).toBe(204);

      const listAfter = await ownerAgent.get("/api/coaches");
      expect(listAfter.body.members).toEqual([]);
    });
  });
});
