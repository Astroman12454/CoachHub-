import express, { type Express, type Request, type Response } from "express";
import type Stripe from "stripe";
import { z } from "zod";
import { storage } from "./storage";
import { getStripe, isStripeConfigured, priceIdFor, planForPriceId, type PurchasablePlan, type BillingInterval } from "./stripe";
import { trackEvent } from "./analytics";

function requireStripeConfigured(_req: Request, res: Response, next: express.NextFunction) {
  if (!isStripeConfigured()) {
    return res.status(503).json({ message: "Billing isn't configured yet." });
  }
  next();
}

const checkoutBodySchema = z.object({
  plan: z.enum(["paid", "club"]).default("paid"),
  interval: z.enum(["monthly", "annual"]).default("monthly"),
});

function originOf(req: Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

// Authenticated billing routes — mounted from server/routes.ts so they pick
// up the same requireAuth/requireTeam-free (account-level, not team-level)
// protection every other /api/* route gets.
export function registerBillingRoutes(app: Express) {
  app.post("/api/billing/checkout", requireStripeConfigured, async (req: Request, res: Response) => {
    try {
      const parsed = checkoutBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid plan or billing interval." });
      }
      const { plan, interval }: { plan: PurchasablePlan; interval: BillingInterval } = parsed.data;
      const priceId = priceIdFor(plan, interval);
      if (!priceId) {
        return res.status(503).json({ message: "That plan isn't available yet." });
      }

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
      // plan travels in both session and subscription metadata: the
      // "completed" webhook only sees the Checkout Session, while
      // "updated"/"deleted" later on only see the Subscription — each needs
      // its own copy to know which plan to apply without re-deriving it
      // from a price id.
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/billing/success`,
        cancel_url: `${origin}/billing/cancel`,
        metadata: { accountId: account.id.toString(), plan },
        subscription_data: { metadata: { accountId: account.id.toString(), plan } },
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
          const plan = session.metadata?.plan === "club" ? "club" : "paid";
          if (!isNaN(accountId) && session.subscription) {
            await storage.setAccountSubscription(accountId, plan, session.subscription as string);
            trackEvent(accountId, plan === "club" ? "upgrade_to_club" : "upgrade_to_paid");
            const referrerAccountId = await storage.markReferralConvertedIfFirstTime(accountId);
            if (referrerAccountId !== null) trackEvent(referrerAccountId, "referral_converted");
          }
          break;
        }
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const account = await storage.getAccountByStripeCustomerId(subscription.customer as string);
          if (account) {
            const isActive = subscription.status === "active" || subscription.status === "trialing";
            const plan =
              subscription.metadata?.plan === "club" || subscription.metadata?.plan === "paid"
                ? subscription.metadata.plan
                : planForPriceId(subscription.items.data[0]?.price.id) ?? "paid";
            await storage.setAccountSubscription(
              account.id,
              isActive ? plan : "free",
              isActive ? subscription.id : null,
            );
            if (!isActive) trackEvent(account.id, "subscription_cancelled");
          }
          break;
        }
      }

      res.json({ received: true });
    },
  );
}
