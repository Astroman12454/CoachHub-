// One-time convenience script: creates the "Coach Hub Paid Plan" product and
// its monthly recurring price in your Stripe account, so you don't have to
// click through the dashboard. Run once, after setting STRIPE_SECRET_KEY:
//
//   npx tsx server/scripts/setup-stripe.ts
//
// Then copy the printed price id into STRIPE_PRICE_ID.
import Stripe from "stripe";

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("Set STRIPE_SECRET_KEY first (a test-mode key is fine to start with).");
    process.exit(1);
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const product = await stripe.products.create({
    name: "Coach Hub Paid Plan",
    description: "Unlimited teams and players, a custom exercise library, and full attendance history.",
  });

  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: 699, // $6.99/month
    recurring: { interval: "month" },
  });

  console.log("\nDone. Add this to your .env:\n");
  console.log(`STRIPE_PRICE_ID=${price.id}`);
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
