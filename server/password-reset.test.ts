// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import crypto from "crypto";
import express from "express";
import request from "supertest";

const { isEmailConfiguredMock, sendPasswordResetEmailMock } = vi.hoisted(() => ({
  isEmailConfiguredMock: vi.fn(),
  sendPasswordResetEmailMock: vi.fn(),
}));
vi.mock("./email", () => ({
  isEmailConfigured: isEmailConfiguredMock,
  sendPasswordResetEmail: sendPasswordResetEmailMock,
}));

import { setupAuth, requireAuth } from "./auth";
import { storage } from "./storage";

function uniqueEmail() {
  return `test-${randomUUID()}@example.com`;
}
const PASSWORD = "correct-password-123";

function createTestApp() {
  const app = express();
  app.use(express.json());
  setupAuth(app);
  app.use("/api", requireAuth);
  return app;
}

describe("password reset", () => {
  let app: express.Express;

  beforeEach(() => {
    isEmailConfiguredMock.mockReset();
    sendPasswordResetEmailMock.mockReset();
    app = createTestApp();
  });

  it("returns 503 when email isn't configured", async () => {
    isEmailConfiguredMock.mockReturnValue(false);
    const res = await request(app).post("/api/forgot-password").send({ email: uniqueEmail() });
    expect(res.status).toBe(503);
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid email", async () => {
    isEmailConfiguredMock.mockReturnValue(true);
    const res = await request(app).post("/api/forgot-password").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("responds with the same message whether or not the account exists, but only emails a real one", async () => {
    isEmailConfiguredMock.mockReturnValue(true);
    sendPasswordResetEmailMock.mockResolvedValue(undefined);
    const email = uniqueEmail();
    await request(app).post("/api/signup").send({ email, password: PASSWORD });

    const forReal = await request(app).post("/api/forgot-password").send({ email });
    const forFake = await request(app).post("/api/forgot-password").send({ email: uniqueEmail() });

    expect(forReal.status).toBe(200);
    expect(forFake.status).toBe(200);
    expect(forReal.body.message).toBe(forFake.body.message);
    expect(sendPasswordResetEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmailMock).toHaveBeenCalledWith(email, expect.stringContaining("/reset-password?token="));
  });

  it("resets the password with a valid token, and the old password stops working", async () => {
    isEmailConfiguredMock.mockReturnValue(true);
    sendPasswordResetEmailMock.mockResolvedValue(undefined);
    const email = uniqueEmail();
    await request(app).post("/api/signup").send({ email, password: PASSWORD });
    await request(app).post("/api/forgot-password").send({ email });

    const resetUrl: string = sendPasswordResetEmailMock.mock.calls[0][1];
    const token = new URL(resetUrl).searchParams.get("token")!;

    const newPassword = "brand-new-password-456";
    const reset = await request(app).post("/api/reset-password").send({ token, password: newPassword });
    expect(reset.status).toBe(200);

    const oldLogin = await request(app).post("/api/login").send({ email, password: PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post("/api/login").send({ email, password: newPassword });
    expect(newLogin.status).toBe(200);
  });

  it("rejects a reset with an unknown token", async () => {
    const res = await request(app).post("/api/reset-password").send({ token: "not-a-real-token", password: "whatever12345" });
    expect(res.status).toBe(400);
  });

  it("rejects a reset with a too-short password", async () => {
    isEmailConfiguredMock.mockReturnValue(true);
    sendPasswordResetEmailMock.mockResolvedValue(undefined);
    const email = uniqueEmail();
    await request(app).post("/api/signup").send({ email, password: PASSWORD });
    await request(app).post("/api/forgot-password").send({ email });
    const resetUrl: string = sendPasswordResetEmailMock.mock.calls[0][1];
    const token = new URL(resetUrl).searchParams.get("token")!;

    const res = await request(app).post("/api/reset-password").send({ token, password: "short" });
    expect(res.status).toBe(400);
  });

  it("rejects a reset with an expired token", async () => {
    const email = uniqueEmail();
    const signup = await request(app).post("/api/signup").send({ email, password: PASSWORD });
    const accountId = signup.body.account.id;

    const rawToken = "a-known-raw-token-for-this-test";
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await storage.setPasswordResetToken(accountId, tokenHash, new Date(Date.now() - 1000));

    const res = await request(app).post("/api/reset-password").send({ token: rawToken, password: "another-new-password" });
    expect(res.status).toBe(400);
  });

  it("a used token can't be reused", async () => {
    isEmailConfiguredMock.mockReturnValue(true);
    sendPasswordResetEmailMock.mockResolvedValue(undefined);
    const email = uniqueEmail();
    await request(app).post("/api/signup").send({ email, password: PASSWORD });
    await request(app).post("/api/forgot-password").send({ email });
    const resetUrl: string = sendPasswordResetEmailMock.mock.calls[0][1];
    const token = new URL(resetUrl).searchParams.get("token")!;

    const first = await request(app).post("/api/reset-password").send({ token, password: "first-new-password-1" });
    expect(first.status).toBe(200);

    const second = await request(app).post("/api/reset-password").send({ token, password: "second-new-password-2" });
    expect(second.status).toBe(400);
  });
});
