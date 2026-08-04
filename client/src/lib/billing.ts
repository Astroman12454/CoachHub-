import { apiRequest } from "@/lib/queryClient";

interface CheckoutResponse {
  url: string;
}

// Both redirect the whole page to Stripe-hosted UI (Checkout / the Billing
// Portal) rather than embedding anything — no Stripe.js/publishable key
// needed client-side, and it's Stripe's own PCI-compliant surface, not ours.
export async function startCheckout(): Promise<void> {
  const res = await apiRequest("POST", "/api/billing/checkout");
  const { url } = (await res.json()) as CheckoutResponse;
  window.location.href = url;
}

export async function openBillingPortal(): Promise<void> {
  const res = await apiRequest("POST", "/api/billing/portal");
  const { url } = (await res.json()) as CheckoutResponse;
  window.location.href = url;
}
