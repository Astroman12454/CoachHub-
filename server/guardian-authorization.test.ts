// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";

const { isEmailConfiguredMock, sendGuardianAuthorizationEmailMock } = vi.hoisted(() => ({
  isEmailConfiguredMock: vi.fn(),
  sendGuardianAuthorizationEmailMock: vi.fn(),
}));
vi.mock("./email", () => ({
  isEmailConfigured: isEmailConfiguredMock,
  sendGuardianAuthorizationEmail: sendGuardianAuthorizationEmailMock,
  sendCoachInviteEmail: vi.fn(),
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

// The decision link is emailed with the raw token (only its hash is
// persisted) — capturing the mock's argument is the only way a test can get
// a token to respond with, same pattern as coaches.test.ts's invite tokens.
function tokenFromMockedRequest(): string {
  const decisionUrl = sendGuardianAuthorizationEmailMock.mock.calls.at(-1)?.[4] as string;
  return new URL(decisionUrl).pathname.split("/").pop()!;
}

async function createMinorPlayer(agent: ReturnType<typeof request.agent>, overrides: Record<string, unknown> = {}) {
  const res = await agent.post("/api/players").send({
    name: "Young Player",
    birthDate: "2015-01-01", // well under the 14-year threshold
    ...overrides,
  });
  return res.body as { id: number };
}

describe("Guardian authorization for minors' health data", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    isEmailConfiguredMock.mockReset().mockReturnValue(true);
    sendGuardianAuthorizationEmailMock.mockReset().mockResolvedValue(undefined);
  });

  it("silently drops medicalNotes on creation for a minor and flags it", async () => {
    const { agent } = await signedInAgent(app);
    const res = await agent.post("/api/players").send({
      name: "Young Player",
      birthDate: "2015-01-01",
      medicalNotes: "Allergic to peanuts",
    });
    expect(res.status).toBe(201);
    expect(res.body.medicalNotes).toBeNull();
    expect(res.body.medicalNotesWithheld).toBe(true);
  });

  it("does not withhold medicalNotes for a player with no birth date on file", async () => {
    const { agent } = await signedInAgent(app);
    const res = await agent.post("/api/players").send({ name: "No Birthdate", medicalNotes: "Fine" });
    expect(res.status).toBe(201);
    expect(res.body.medicalNotes).toBe("Fine");
    expect(res.body.medicalNotesWithheld).toBe(false);
  });

  it("blocks writing medicalNotes on a minor via PUT without an active authorization", async () => {
    const { agent } = await signedInAgent(app);
    const player = await createMinorPlayer(agent);

    const res = await agent.put(`/api/players/${player.id}`).send({ medicalNotes: "Asthma" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("guardian_authorization_required");
  });

  it("blocks reporting an injury on a minor without an active authorization", async () => {
    const { agent } = await signedInAgent(app);
    const player = await createMinorPlayer(agent);

    const res = await agent.post(`/api/players/${player.id}/injuries`).send({
      description: "Sprained ankle",
      reportedDate: "2026-01-01",
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("guardian_authorization_required");
  });

  it("allows an unrelated field update on a minor without touching authorization at all", async () => {
    const { agent } = await signedInAgent(app);
    const player = await createMinorPlayer(agent);

    const res = await agent.put(`/api/players/${player.id}`).send({ jerseyNumber: 23 });
    expect(res.status).toBe(200);
    expect(res.body.jerseyNumber).toBe(23);
  });

  it("full flow: request, approve, then medicalNotes and injuries are allowed", async () => {
    const { agent } = await signedInAgent(app);
    const player = await createMinorPlayer(agent);

    const reqRes = await agent
      .post(`/api/players/${player.id}/guardian-authorization/request`)
      .send({ guardianEmail: "parent@example.com" });
    expect(reqRes.status).toBe(201);
    expect(sendGuardianAuthorizationEmailMock).toHaveBeenCalled();

    const consentsBefore = await agent.get(`/api/players/${player.id}/consents`);
    expect(consentsBefore.body.consents).toEqual([]);
    expect(consentsBefore.body.pendingRequest.guardianEmail).toBe("parent@example.com");

    const token = tokenFromMockedRequest();

    const infoRes = await request(app).get(`/api/guardian-authorization/${token}`);
    expect(infoRes.status).toBe(200);
    expect(infoRes.body.playerName).toBe("Young Player");

    const approveRes = await request(app).post(`/api/guardian-authorization/${token}`).send({ decision: "approved" });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("approved");

    const putRes = await agent.put(`/api/players/${player.id}`).send({ medicalNotes: "Asthma" });
    expect(putRes.status).toBe(200);
    expect(putRes.body.medicalNotes).toBe("Asthma");

    const injuryRes = await agent.post(`/api/players/${player.id}/injuries`).send({
      description: "Sprained ankle",
      reportedDate: "2026-01-01",
    });
    expect(injuryRes.status).toBe(201);

    const consentsAfter = await agent.get(`/api/players/${player.id}/consents`);
    expect(consentsAfter.body.consents).toHaveLength(1);
    expect(consentsAfter.body.consents[0].guardianEmail).toBe("parent@example.com");
  });

  it("a declined request leaves the player still blocked", async () => {
    const { agent } = await signedInAgent(app);
    const player = await createMinorPlayer(agent);
    await agent.post(`/api/players/${player.id}/guardian-authorization/request`).send({ guardianEmail: "parent@example.com" });
    const token = tokenFromMockedRequest();

    const declineRes = await request(app).post(`/api/guardian-authorization/${token}`).send({ decision: "declined" });
    expect(declineRes.status).toBe(200);
    expect(declineRes.body.status).toBe("declined");

    const putRes = await agent.put(`/api/players/${player.id}`).send({ medicalNotes: "Asthma" });
    expect(putRes.status).toBe(403);
  });

  it("a resolved request token can't be responded to twice", async () => {
    const { agent } = await signedInAgent(app);
    const player = await createMinorPlayer(agent);
    await agent.post(`/api/players/${player.id}/guardian-authorization/request`).send({ guardianEmail: "parent@example.com" });
    const token = tokenFromMockedRequest();

    await request(app).post(`/api/guardian-authorization/${token}`).send({ decision: "approved" });
    const second = await request(app).post(`/api/guardian-authorization/${token}`).send({ decision: "approved" });
    expect(second.status).toBe(404);
  });

  it("rejects a second request while one is already pending", async () => {
    const { agent } = await signedInAgent(app);
    const player = await createMinorPlayer(agent);
    await agent.post(`/api/players/${player.id}/guardian-authorization/request`).send({ guardianEmail: "parent@example.com" });

    const dup = await agent
      .post(`/api/players/${player.id}/guardian-authorization/request`)
      .send({ guardianEmail: "parent2@example.com" });
    expect(dup.status).toBe(409);
  });

  it("revoking an active consent re-applies the gate", async () => {
    const { agent } = await signedInAgent(app);
    const player = await createMinorPlayer(agent);
    await agent.post(`/api/players/${player.id}/guardian-authorization/request`).send({ guardianEmail: "parent@example.com" });
    const token = tokenFromMockedRequest();
    await request(app).post(`/api/guardian-authorization/${token}`).send({ decision: "approved" });

    const consents = await agent.get(`/api/players/${player.id}/consents`);
    const consentId = consents.body.consents[0].id;

    const revokeRes = await agent.delete(`/api/players/${player.id}/consents/${consentId}`);
    expect(revokeRes.status).toBe(204);

    const putRes = await agent.put(`/api/players/${player.id}`).send({ medicalNotes: "Asthma" });
    expect(putRes.status).toBe(403);
  });

  it("404s for an unknown or already-resolved token on the public GET", async () => {
    const res = await request(app).get("/api/guardian-authorization/not-a-real-token");
    expect(res.status).toBe(404);
  });
});
