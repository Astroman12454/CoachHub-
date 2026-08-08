// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { priceIdFor, planForPriceId, isStripeConfigured } from "./stripe";

const ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_ID",
  "STRIPE_PRICE_ID_PAID_MONTHLY",
  "STRIPE_PRICE_ID_PAID_ANNUAL",
  "STRIPE_PRICE_ID_CLUB_MONTHLY",
  "STRIPE_PRICE_ID_CLUB_ANNUAL",
] as const;

describe("stripe price lookups", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("maps each plan/interval to its own configured price id", () => {
    process.env.STRIPE_PRICE_ID_PAID_MONTHLY = "price_paid_monthly";
    process.env.STRIPE_PRICE_ID_PAID_ANNUAL = "price_paid_annual";
    process.env.STRIPE_PRICE_ID_CLUB_MONTHLY = "price_club_monthly";
    process.env.STRIPE_PRICE_ID_CLUB_ANNUAL = "price_club_annual";

    expect(priceIdFor("paid", "monthly")).toBe("price_paid_monthly");
    expect(priceIdFor("paid", "annual")).toBe("price_paid_annual");
    expect(priceIdFor("club", "monthly")).toBe("price_club_monthly");
    expect(priceIdFor("club", "annual")).toBe("price_club_annual");
  });

  it("falls back to the legacy STRIPE_PRICE_ID for paid-monthly when the new var isn't set", () => {
    process.env.STRIPE_PRICE_ID = "price_legacy";
    expect(priceIdFor("paid", "monthly")).toBe("price_legacy");
  });

  it("returns undefined for a plan/interval whose price was never configured", () => {
    process.env.STRIPE_PRICE_ID_PAID_MONTHLY = "price_paid_monthly";
    expect(priceIdFor("club", "annual")).toBeUndefined();
  });

  it("planForPriceId reverses the lookup, and is null for an unknown id", () => {
    process.env.STRIPE_PRICE_ID_PAID_MONTHLY = "price_paid_monthly";
    process.env.STRIPE_PRICE_ID_CLUB_ANNUAL = "price_club_annual";

    expect(planForPriceId("price_paid_monthly")).toBe("paid");
    expect(planForPriceId("price_club_annual")).toBe("club");
    expect(planForPriceId("price_nonexistent")).toBeNull();
    expect(planForPriceId(undefined)).toBeNull();
  });

  it("isStripeConfigured requires both the secret key and a paid-monthly price", () => {
    expect(isStripeConfigured()).toBe(false);

    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    expect(isStripeConfigured()).toBe(false);

    process.env.STRIPE_PRICE_ID_PAID_MONTHLY = "price_paid_monthly";
    expect(isStripeConfigured()).toBe(true);
  });
});
