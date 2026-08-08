// One-time convenience script: creates the "Coach Hub Paid Plan" and
// "Coach Hub Club Plan" products, each with a monthly and an annual
// recurring price, in your Stripe account, so you don't have to click
// through the dashboard. Run once, after setting STRIPE_SECRET_KEY:
//
//   npx tsx server/scripts/setup-stripe.ts
//
// Then copy the printed price ids into your .env.
import Stripe from "stripe";

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("Set STRIPE_SECRET_KEY first (a test-mode key is fine to start with).");
    process.exit(1);
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const paidProduct = await stripe.products.create({
    name: "Coach Hub Paid Plan",
    description: "Unlimited teams and players, a custom exercise library, and full attendance history.",
  });
  const paidMonthly = await stripe.prices.create({
    product: paidProduct.id,
    currency: "usd",
    unit_amount: 699, // $6.99/month
    recurring: { interval: "month" },
  });
  const paidAnnual = await stripe.prices.create({
    product: paidProduct.id,
    currency: "usd",
    unit_amount: 7130, // $71.30/year — 15% off 12 months at $6.99
    recurring: { interval: "year" },
  });

  const clubProduct = await stripe.products.create({
    name: "Coach Hub Club Plan",
    description: "Everything in Paid, plus up to 3 coaches sharing access to the same teams.",
  });
  const clubMonthly = await stripe.prices.create({
    product: clubProduct.id,
    currency: "usd",
    unit_amount: 1999, // $19.99/month
    recurring: { interval: "month" },
  });
  const clubAnnual = await stripe.prices.create({
    product: clubProduct.id,
    currency: "usd",
    unit_amount: 20390, // $203.90/year — 15% off 12 months at $19.99
    recurring: { interval: "year" },
  });

  console.log("\nDone. Add these to your .env:\n");
  console.log(`STRIPE_PRICE_ID_PAID_MONTHLY=${paidMonthly.id}`);
  console.log(`STRIPE_PRICE_ID_PAID_ANNUAL=${paidAnnual.id}`);
  console.log(`STRIPE_PRICE_ID_CLUB_MONTHLY=${clubMonthly.id}`);
  console.log(`STRIPE_PRICE_ID_CLUB_ANNUAL=${clubAnnual.id}`);
  console.log(
    "\nThen, in the Stripe dashboard, add a webhook endpoint pointing at " +
    "<your-deployed-url>/api/webhooks/stripe listening for: " +
    "checkout.session.completed, customer.subscription.updated, customer.subscription.deleted — " +
    "and copy its signing secret into STRIPE_WEBHOOK_SECRET.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
