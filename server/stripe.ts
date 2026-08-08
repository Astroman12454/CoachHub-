import Stripe from "stripe";
import type { Plan } from "@shared/schema";

export type BillingInterval = "monthly" | "annual";
// Only tiers that are ever actually purchased through Checkout — "free"
// isn't a Stripe price. Keeps price lookups from having to model the "no
// price for this plan" case.
export type PurchasablePlan = Extract<Plan, "paid" | "club">;

// Reads process.env fresh on every call (not a module-level const) so tests
// can set these env vars in beforeAll before exercising the routes that use
// them, matching the pattern in server/push.ts. STRIPE_PRICE_ID is kept as a
// fallback for STRIPE_PRICE_ID_PAID_MONTHLY so an existing single-price
// deployment keeps working after this upgrade.
function stripePrices(): Record<PurchasablePlan, Record<BillingInterval, string | undefined>> {
  return {
    paid: {
      monthly: process.env.STRIPE_PRICE_ID_PAID_MONTHLY || process.env.STRIPE_PRICE_ID,
      annual: process.env.STRIPE_PRICE_ID_PAID_ANNUAL,
    },
    club: {
      monthly: process.env.STRIPE_PRICE_ID_CLUB_MONTHLY,
      annual: process.env.STRIPE_PRICE_ID_CLUB_ANNUAL,
    },
  };
}

export function priceIdFor(plan: PurchasablePlan, interval: BillingInterval): string | undefined {
  return stripePrices()[plan][interval];
}

// Reverse lookup for the subscription webhook, which only has a price id to
// go on when metadata is somehow missing.
export function planForPriceId(priceId: string | undefined): PurchasablePlan | null {
  if (!priceId) return null;
  const prices = stripePrices();
  for (const plan of Object.keys(prices) as PurchasablePlan[]) {
    if (Object.values(prices[plan]).includes(priceId)) return plan;
  }
  return null;
}

// The app is "configured" once the secret key and at least the base Paid
// monthly price exist — annual and Club prices are additive and degrade
// gracefully (that specific checkout returns 503) if left unset.
export function isStripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && stripePrices().paid.monthly);
}

let stripeClient: Stripe | null = null;

// Lazily constructed so importing this module never throws when billing
// just isn't configured yet (dev, or before the account owner has added
// their own Stripe keys) — only calling a route that actually needs it does.
export function getStripe(): Stripe {
  if (!stripeClient) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}
