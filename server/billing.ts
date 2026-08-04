import express, { type Express, type Request, type Response } from "express";
import type Stripe from "stripe";
import { storage } from "./storage";
import { getStripe, isStripeConfigured, STRIPE_PRICE_ID } from "./stripe";

function requireStripeConfigured(_req: Request, res: Response, next: express.NextFunction) {
  if (!isStripeConfigured()) {
    return res.status(503).json({ message: "Billing isn't configured yet." });
  }
  next();
}

function originOf(req: Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

// Authenticated billing routes — mounted from server/routes.ts so they pick
// up the same requireAuth/requireTeam-free (account-level, not team-level)
// protection every other /api/* route gets.
export function registerBillingRoutes(app: Express) {
  app.post("/api/billing/checkout", requireStripeConfigured, async (req: Request, res: Response) => {
    try {
      const accountId = req.session.accountId!;
      const account = await storage.getAccountById(accountId);
      if (!account) return res.status(404).json({ message: "Account not found" });

      const stripe = getStripe();
      let customerId = account.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: account.email,
          metadata: { accountId: account.id.toString() },
        });
        customerId = customer.id;
        await storage.setAccountStripeCustomerId(account.id, customerId);
      }

      const origin = originOf(req);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: STRIPE_PRICE_ID!, quantity: 1 }],
        success_url: `${origin}/billing/success`,
        cancel_url: `${origin}/billing/cancel`,
        metadata: { accountId: account.id.toString() },
      });

      res.json({ url: session.url });
    } catch (error) {
      res.status(500).json({ message: "Failed to start checkout" });
    }
  });

  app.post("/api/billing/portal", requireStripeConfigured, async (req: Request, res: Response) => {
    try {
      const account = await storage.getAccountById(req.session.accountId!);
      if (!account?.stripeCustomerId) {
        return res.status(400).json({ message: "No billing account yet — upgrade first." });
      }

      const stripe = getStripe();
      const session = await stripe.billingPortal.sessions.create({
        customer: account.stripeCustomerId,
        return_url: `${originOf(req)}/dashboard`,
      });

      res.json({ url: session.url });
    } catch (error) {
      res.status(500).json({ message: "Failed to open the billing portal" });
    }
  });
}

// Registered directly on the app (server/index.ts), before express.json()
// and before requireAuth: Stripe calls this unauthenticated by our session
// system — its signature (verified against STRIPE_WEBHOOK_SECRET) is the
// only auth it has, and signature verification needs the raw request body,
// which a global express.json() would have already consumed and reshaped.
export function setupStripeWebhook(app: Express) {
  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
        return res.status(503).end();
      }

      const stripe = getStripe();
      let event: Stripe.Event;
      try {
        const signature = req.headers["stripe-signature"];
        event = stripe.webhooks.constructEvent(
          req.body,
          signature as string,
          process.env.STRIPE_WEBHOOK_SECRET,
        );
      } catch {
        return res.status(400).send("Webhook signature verification failed");
      }

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const accountId = parseInt(session.metadata?.accountId ?? "");
          if (!isNaN(accountId) && session.subscription) {
            await storage.setAccountSubscription(accountId, "paid", session.subscription as string);
          }
          break;
        }
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const account = await storage.getAccountByStripeCustomerId(subscription.customer as string);
          if (account) {
            const isActive = subscription.status === "active" || subscription.status === "trialing";
            await storage.setAccountSubscription(
              account.id,
              isActive ? "paid" : "free",
              isActive ? subscription.id : null,
            );
          }
          break;
        }
      }

      res.json({ received: true });
    },
  );
}
