import Stripe from "stripe";

// A monthly recurring Price created in the Stripe dashboard (or via
// server/scripts/setup-stripe.ts) for the paid plan — required alongside
// the secret key before checkout can work.
export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;

export function isStripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && STRIPE_PRICE_ID);
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
