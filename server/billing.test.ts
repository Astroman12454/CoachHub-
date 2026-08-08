// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";

const { checkoutSessionsCreateMock, customersCreateMock } = vi.hoisted(() => ({
  checkoutSessionsCreateMock: vi.fn(),
  customersCreateMock: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class {
    customers = { create: customersCreateMock };
    checkout = { sessions: { create: checkoutSessionsCreateMock } };
    billingPortal = { sessions: { create: vi.fn() } };
  },
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
  return agent;
}

describe("POST /api/billing/checkout", () => {
  let app: express.Express;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.STRIPE_PRICE_ID_PAID_MONTHLY = "price_paid_monthly";
    process.env.STRIPE_PRICE_ID_PAID_ANNUAL = "price_paid_annual";
    process.env.STRIPE_PRICE_ID_CLUB_MONTHLY = "price_club_monthly";
    process.env.STRIPE_PRICE_ID_CLUB_ANNUAL = "price_club_annual";
    app = await createTestApp();
  });

  beforeEach(() => {
    customersCreateMock.mockReset().mockResolvedValue({ id: "cus_fake" });
    checkoutSessionsCreateMock.mockReset().mockResolvedValue({ url: "https://checkout.stripe.com/session_fake" });
  });

  it("defaults to the Paid monthly price when no plan/interval is given", async () => {
    const agent = await signedInAgent(app);
    const res = await agent.post("/api/billing/checkout").send({});

    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://checkout.stripe.com/session_fake");
    const call = checkoutSessionsCreateMock.mock.calls[0][0];
    expect(call.line_items[0].price).toBe("price_paid_monthly");
    expect(call.metadata.plan).toBe("paid");
    expect(call.subscription_data.metadata.plan).toBe("paid");
  });

  it("uses the Club annual price when both are requested", async () => {
    const agent = await signedInAgent(app);
    const res = await agent.post("/api/billing/checkout").send({ plan: "club", interval: "annual" });

    expect(res.status).toBe(200);
    const call = checkoutSessionsCreateMock.mock.calls[0][0];
    expect(call.line_items[0].price).toBe("price_club_annual");
    expect(call.metadata.plan).toBe("club");
  });

  it("rejects a plan or interval outside the known enum values", async () => {
    const agent = await signedInAgent(app);
    const res = await agent.post("/api/billing/checkout").send({ plan: "enterprise", interval: "monthly" });
    expect(res.status).toBe(400);
    expect(checkoutSessionsCreateMock).not.toHaveBeenCalled();
  });

  it("returns 503 for a plan/interval combination whose price isn't configured, without creating a Stripe customer", async () => {
    const originalClubAnnual = process.env.STRIPE_PRICE_ID_CLUB_ANNUAL;
    delete process.env.STRIPE_PRICE_ID_CLUB_ANNUAL;
    try {
      const agent = await signedInAgent(app);
      const res = await agent.post("/api/billing/checkout").send({ plan: "club", interval: "annual" });
      expect(res.status).toBe(503);
      expect(customersCreateMock).not.toHaveBeenCalled();
      expect(checkoutSessionsCreateMock).not.toHaveBeenCalled();
    } finally {
      process.env.STRIPE_PRICE_ID_CLUB_ANNUAL = originalClubAnnual;
    }
  });
});
