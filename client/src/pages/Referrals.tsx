import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy, Check, Gift, Users, TrendingUp } from "lucide-react";
import TopBar from "@/components/TopBar";
import ErrorState from "@/components/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReferralStats } from "@shared/schema";

// The coach-to-coach growth loop the audit called out as entirely missing.
// Fulfillment note (not shown in this UI): reaching a paid plan flips
// referralConvertedAt server-side and fires a "referral_converted" analytics
// event (see server/billing.ts's webhook) — but nothing here actually
// credits Stripe automatically yet. Today that's a manual step for whoever
// runs the app, using this page's own list as the queue of who's owed a
// free month.
export default function Referrals() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery<ReferralStats>({ queryKey: ["/api/account/referrals"] });

  const referralUrl = data ? `${window.location.origin}/?ref=${data.code}` : "";

  const copyLink = async () => {
    if (!referralUrl) return;
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      <TopBar title={t("referrals.title")} subtitle={t("referrals.subtitle")} />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6 max-w-2xl space-y-6 fade-in">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-basketball-orange" strokeWidth={1.75} aria-hidden="true" />
              {t("referrals.yourLink")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">{t("referrals.yourLinkDescription")}</p>
            <div className="flex items-center gap-2">
              <Input
                value={isLoading ? "" : referralUrl}
                readOnly
                aria-label={t("referrals.yourLink")}
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button type="button" variant="outline" onClick={copyLink} disabled={!data}>
                {copied ? (
                  <Check className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Copy className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
                )}
                {copied ? t("referrals.copied") : t("referrals.copyLink")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <Skeleton className="h-24" />
        ) : isError ? (
          <ErrorState title={t("referrals.loadError")} onRetry={() => refetch()} />
        ) : data ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6 text-center">
                  <Users className="w-5 h-5 mx-auto mb-2 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                  <p className="font-display font-bold text-3xl tabular-nums text-foreground">{data.totalReferred}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mt-1">{t("referrals.totalReferred")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <TrendingUp className="w-5 h-5 mx-auto mb-2 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                  <p className="font-display font-bold text-3xl tabular-nums text-foreground">{data.totalConverted}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mt-1">{t("referrals.totalConverted")}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t("referrals.yourReferrals")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.referrals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("referrals.noReferralsYet")}</p>
                ) : (
                  data.referrals.map((r) => (
                    <div key={r.email} className="flex items-center justify-between gap-2 border border-border rounded-lg p-3">
                      <span className="text-sm truncate">{r.email}</span>
                      <Badge
                        variant={r.convertedAt ? "default" : "outline"}
                        className={r.convertedAt ? "basketball-orange text-white border-0 shrink-0" : "shrink-0"}
                      >
                        {r.convertedAt ? t("referrals.statusConverted") : t("referrals.statusInvited")}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </main>
    </div>
  );
}
