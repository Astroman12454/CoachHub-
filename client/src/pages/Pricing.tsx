import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import LanguageToggle from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { extractErrorMessage } from "@/lib/queryClient";
import { startCheckout } from "@/lib/billing";

type Interval = "monthly" | "annual";

const PAID_PRICE = { monthly: 6.99, annual: 71.30 };
const CLUB_PRICE = { monthly: 19.99, annual: 203.90 };

// Public marketing page — reachable logged out (linked from Login) or
// logged in (an authenticated visitor's Paid/Club buttons check out
// directly instead of bouncing through signup).
export default function Pricing() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [interval, setInterval] = useState<Interval>("monthly");
  const [pendingPlan, setPendingPlan] = useState<"paid" | "club" | null>(null);

  const upgrade = async (plan: "paid" | "club") => {
    if (pendingPlan) return;
    setPendingPlan(plan);
    try {
      await startCheckout(plan, interval);
      setPendingPlan(null);
    } catch (error) {
      toast({
        title: t("common.billing"),
        description: extractErrorMessage(error) ?? t("common.couldntOpenBilling"),
        variant: "destructive",
      });
      setPendingPlan(null);
    }
  };

  const freeFeatures = t("pricing.free.features", { returnObjects: true }) as string[];
  const paidFeatures = t("pricing.paid.features", { returnObjects: true }) as string[];
  const clubFeatures = t("pricing.club.features", { returnObjects: true }) as string[];

  return (
    <main className="min-h-screen bg-rail p-4 py-10">
      {/* top-[max(...)] reserves space under iOS's black-translucent status
          bar when this app is added to the home screen. */}
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 text-foreground">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-5xl mx-auto fade-in">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-14 h-14 basketball-orange rounded-lg flex items-center justify-center mb-4">
            <BrandMark className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-display font-bold uppercase tracking-tight text-3xl text-rail-foreground">
            {t("pricing.title")}
          </h1>
          <p className="text-rail-muted text-sm mt-2 max-w-md">{t("pricing.subtitle")}</p>

          <div className="mt-6 inline-flex rounded-lg border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => setInterval("monthly")}
              aria-pressed={interval === "monthly"}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                interval === "monthly" ? "basketball-orange text-white" : "text-muted-foreground"
              }`}
            >
              {t("pricing.monthly")}
            </button>
            <button
              type="button"
              onClick={() => setInterval("annual")}
              aria-pressed={interval === "annual"}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                interval === "annual" ? "basketball-orange text-white" : "text-muted-foreground"
              }`}
            >
              {t("pricing.annual")} <span>{t("pricing.annualSavings")}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Free */}
          <Card className="flex flex-col">
            <CardHeader>
              <h2 className="font-display font-bold uppercase tracking-tight text-xl">{t("pricing.free.name")}</h2>
              <p className="text-3xl font-bold mt-2">{t("pricing.free.price")}</p>
              <p className="text-sm text-muted-foreground mt-1">{t("pricing.free.tagline")}</p>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <ul className="space-y-2 text-sm flex-1">
                {freeFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-success shrink-0 mt-0.5" strokeWidth={2} aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {!isAuthenticated && (
                <Button asChild variant="outline" className="mt-6 w-full">
                  <Link href="/?signup=1">{t("pricing.getStarted")}</Link>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Paid */}
          <Card className="flex flex-col border-basketball-orange border-2">
            <CardHeader>
              <h2 className="font-display font-bold uppercase tracking-tight text-xl">{t("pricing.paid.name")}</h2>
              <p className="text-3xl font-bold mt-2">
                ${PAID_PRICE[interval].toFixed(2)}
                <span className="text-sm font-normal text-muted-foreground">
                  {interval === "monthly" ? t("pricing.perMonth") : t("pricing.perYear")}
                </span>
              </p>
              <p className="text-sm text-muted-foreground mt-1">{t("pricing.paid.tagline")}</p>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <ul className="space-y-2 text-sm flex-1">
                {paidFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-success shrink-0 mt-0.5" strokeWidth={2} aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {isAuthenticated ? (
                <Button
                  className="mt-6 w-full basketball-orange basketball-orange-hover text-white"
                  onClick={() => upgrade("paid")}
                  disabled={pendingPlan !== null}
                >
                  {t("pricing.upgradeTo", { plan: t("pricing.paid.name") })}
                </Button>
              ) : (
                <Button asChild className="mt-6 w-full basketball-orange basketball-orange-hover text-white">
                  <Link href="/?signup=1">{t("pricing.getStarted")}</Link>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Club */}
          <Card className="flex flex-col">
            <CardHeader>
              <h2 className="font-display font-bold uppercase tracking-tight text-xl">{t("pricing.club.name")}</h2>
              <p className="text-3xl font-bold mt-2">
                ${CLUB_PRICE[interval].toFixed(2)}
                <span className="text-sm font-normal text-muted-foreground">
                  {interval === "monthly" ? t("pricing.perMonth") : t("pricing.perYear")}
                </span>
              </p>
              <p className="text-sm text-muted-foreground mt-1">{t("pricing.club.tagline")}</p>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <ul className="space-y-2 text-sm flex-1">
                {clubFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-success shrink-0 mt-0.5" strokeWidth={2} aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {isAuthenticated ? (
                <Button
                  variant="outline"
                  className="mt-6 w-full"
                  onClick={() => upgrade("club")}
                  disabled={pendingPlan !== null}
                >
                  {t("pricing.upgradeTo", { plan: t("pricing.club.name") })}
                </Button>
              ) : (
                <Button asChild variant="outline" className="mt-6 w-full">
                  <Link href="/?signup=1">{t("pricing.getStarted")}</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-sm text-rail-muted mt-8">
          <Link href="/" className="hover:text-rail-foreground hover:underline">{t("pricing.backToApp")}</Link>
        </p>
      </div>
    </main>
  );
}
