import { Capacitor } from "@capacitor/core";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import i18n from "@/i18n";

interface CheckoutResponse {
  url: string;
}

// Apple rejects apps that let a user unlock paid features through a
// payment flow other than its own in-app purchases (guideline 3.1.1).
// This app bills through Stripe Checkout, not StoreKit, so upgrading has
// to happen from a browser — tapping "Upgrade" inside the native
// (Capacitor) app can't redirect to Stripe like it does on the web.
function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

// Both redirect the whole page to Stripe-hosted UI (Checkout / the Billing
// Portal) rather than embedding anything — no Stripe.js/publishable key
// needed client-side, and it's Stripe's own PCI-compliant surface, not ours.
export async function startCheckout(): Promise<void> {
  if (isNativeApp()) {
    toast({
      title: i18n.t("billing.nativeUpgradeTitle"),
      description: i18n.t("billing.nativeUpgradeDescription"),
    });
    return;
  }
  const res = await apiRequest("POST", "/api/billing/checkout");
  const { url } = (await res.json()) as CheckoutResponse;
  window.location.href = url;
}

export async function openBillingPortal(): Promise<void> {
  const res = await apiRequest("POST", "/api/billing/portal");
  const { url } = (await res.json()) as CheckoutResponse;
  window.location.href = url;
}
