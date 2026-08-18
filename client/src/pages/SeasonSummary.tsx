import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Share2, Copy, Check, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import LanguageToggle from "@/components/LanguageToggle";
import BrandMark from "@/components/BrandMark";
import type { PlayerSeasonSummary } from "@shared/schema";

// A single shareable card, not the day-to-day utility view Portal.tsx is —
// same token, same public /portal/ route family (see server/routes.ts's
// GET /api/portal/:token/summary), but meant to be linked or screenshotted
// outward by a parent or player, so it leads with the biggest number
// instead of a stack of equally-weighted cards.
export default function SeasonSummary() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [copied, setCopied] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery<PlayerSeasonSummary>({
    queryKey: [`/api/portal/${token}/summary`],
    retry: false,
  });

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const handleShare = async () => {
    if (canShare) {
      try {
        await navigator.share({ title: t("seasonSummary.title"), url: shareUrl });
        return;
      } catch {
        // User cancelled the native share sheet, or it isn't actually
        // supported despite the feature check — fall through to copy.
      }
    }
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background p-4 pt-[max(1rem,env(safe-area-inset-top))] lg:p-8 lg:pt-[max(2rem,env(safe-area-inset-top))]">
        <div className="max-w-md mx-auto space-y-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-32" />
        </div>
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4 relative">
        <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 text-foreground">
          <LanguageToggle />
        </div>
        <div className="w-full max-w-sm">
          <ErrorState
            title={t("portal.linkNotAvailable")}
            description={t("portal.linkNotAvailableDescription")}
            onRetry={() => refetch()}
          />
        </div>
      </main>
    );
  }

  const statTiles: [string, string | number][] = data.gameStats
    ? [
        [t("seasonSummary.gamesPlayed"), data.gameStats.gamesPlayed],
        [t("seasonSummary.points"), data.gameStats.points],
        [t("seasonSummary.rebounds"), data.gameStats.rebounds],
        [t("seasonSummary.assists"), data.gameStats.assists],
      ]
    : [];

  return (
    <main className="min-h-screen bg-background p-4 pt-[max(1rem,env(safe-area-inset-top))] lg:p-8 lg:pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link href={`/portal/${token}`} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
            {t("seasonSummary.backToPortal")}
          </Link>
          <LanguageToggle />
        </div>

        <Card className="overflow-hidden border-basketball-orange/30">
          <div className="basketball-orange px-6 pt-8 pb-6 text-center text-white">
            <p className="text-xs uppercase tracking-wide opacity-80">{data.team.name}</p>
            <h1 className="font-display font-bold uppercase tracking-tight text-3xl leading-tight mt-1">
              {data.player.name}
            </h1>
            <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
              {data.player.jerseyNumber != null && (
                <Badge variant="secondary" className="bg-white/20 text-white border-0">
                  #{data.player.jerseyNumber}
                </Badge>
              )}
              {data.player.position && (
                <Badge variant="secondary" className="bg-white/20 text-white border-0">
                  {data.player.position}
                </Badge>
              )}
            </div>
          </div>

          <CardContent className="pt-6 space-y-6">
            <div className="text-center">
              <p className="font-display font-bold text-5xl tabular-nums text-foreground">
                {data.attendance.rate}%
              </p>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mt-1">
                {t("seasonSummary.attendanceRate")}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("seasonSummary.sessionsAndHours", { present: data.attendance.present, total: data.attendance.total, hours: data.attendance.totalHoursTrained })}
              </p>
            </div>

            {statTiles.length > 0 && (
              <div className="grid grid-cols-4 gap-2 text-center border-t border-border pt-4">
                {statTiles.map(([label, value]) => (
                  <div key={label}>
                    <p className="font-display font-bold text-xl tabular-nums text-foreground">{value}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                  </div>
                ))}
              </div>
            )}

            {data.evaluationHighlights.length > 0 && (
              <div className="border-t border-border pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  {t("seasonSummary.topSkills")}
                </p>
                <div className="space-y-2">
                  {data.evaluationHighlights.map((h) => (
                    <div key={h.testName} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{h.testName}</span>
                      <Badge className="basketball-orange text-white border-0 tabular-nums">{h.score}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Button type="button" variant="outline" className="w-full" onClick={handleShare}>
          {copied ? (
            <>
              <Check className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
              {t("seasonSummary.linkCopied")}
            </>
          ) : canShare ? (
            <>
              <Share2 className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
              {t("seasonSummary.share")}
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
              {t("seasonSummary.copyLink")}
            </>
          )}
        </Button>

        {/* Same credit-line-not-ad footer as Portal.tsx — this page is even
            more likely to actually get reshared outward, so it carries the
            same quiet CTA rather than a louder one. */}
        <footer className="pt-2 text-center space-y-1">
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1 justify-center w-full">
            {t("portal.poweredByPrefix")}
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <BrandMark className="w-3 h-3" />
              Backboard
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {t("portal.areYouACoach")}{" "}
            <Link href="/?signup=1" className="text-basketball-orange font-medium hover:underline">
              {t("portal.createYourTeam")}
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
