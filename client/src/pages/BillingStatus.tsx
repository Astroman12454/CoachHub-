import { useLocation } from "wouter";
import { CheckCircle2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface BillingStatusProps {
  status: "success" | "cancel";
}

// Landed on after Stripe Checkout redirects back (success_url/cancel_url).
// The webhook — not this page — is what actually flips the account's plan;
// this is just the human-facing confirmation.
export default function BillingStatus({ status }: BillingStatusProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const isSuccess = status === "success";

  return (
    <main className="flex flex-col h-full items-center justify-center p-6 text-center">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isSuccess ? "bg-success-tint" : "bg-muted"}`}>
        {isSuccess ? (
          <CheckCircle2 className="w-8 h-8 text-success" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <XCircle className="w-8 h-8 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
        )}
      </div>
      <h1 className="font-display font-bold uppercase tracking-tight text-2xl text-foreground mb-2">
        {isSuccess ? t("billingStatus.upgraded") : t("billingStatus.canceled")}
      </h1>
      <p className="text-muted-foreground max-w-sm mb-6">
        {isSuccess
          ? t("billingStatus.upgradedDescription")
          : t("billingStatus.canceledDescription")}
      </p>
      <Button
        onClick={() => setLocation("/dashboard")}
        className="basketball-orange basketball-orange-hover text-white"
      >
        {t("billingStatus.backToDashboard")}
      </Button>
    </main>
  );
}
