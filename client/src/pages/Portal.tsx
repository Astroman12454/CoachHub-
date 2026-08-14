import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Trophy, ClipboardCheck, BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import PortalNotificationsToggle from "@/components/PortalNotificationsToggle";
import LanguageToggle from "@/components/LanguageToggle";
import BrandMark from "@/components/BrandMark";
import type { PortalData } from "@shared/schema";

type PortalResponse = PortalData & { vapidPublicKey: string | null };

const ATTENDANCE_BADGE: Record<string, string> = {
  present: "bg-success-tint text-success border-success",
  absent: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/40",
  late: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800/40",
  excused: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40",
};

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// A completely standalone page — not wrapped in the authenticated Layout —
// reachable by anyone with the link (see server/auth.ts's requireAuth
// exemption for /api/portal/:token). Read-only: no mutation ever originates
// from this page.
export default function Portal() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError, refetch } = useQuery<PortalResponse>({
    queryKey: [`/api/portal/${token}`],
    retry: false,
  });

  if (isLoading) {
    return (
      // pt-[max(...)] reserves space under iOS's black-translucent status bar
      // if a parent/player adds this shared link to their home screen.
      <main className="min-h-screen bg-background p-4 pt-[max(1rem,env(safe-area-inset-top))] lg:p-8 lg:pt-[max(2rem,env(safe-area-inset-top))]">
        <div className="max-w-2xl mx-auto space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4 relative">
        {/* top-[max(...)] reserves space under iOS's black-translucent
            status bar when this app is added to the home screen. */}
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

  const statTiles: [string, number][] = data.stats
    ? [
        ["GP", data.stats.gamesPlayed],
        ["PTS", data.stats.points],
        ["REB", data.stats.rebounds],
        ["AST", data.stats.assists],
      ]
    : [];

  return (
    // pt-[max(...)] reserves space under iOS's black-translucent status bar
    // if a parent/player adds this shared link to their home screen.
    <main className="min-h-screen bg-background p-4 pt-[max(1rem,env(safe-area-inset-top))] lg:p-8 lg:pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm text-muted-foreground">{data.team.name}</p>
            <h1 className="font-display font-bold uppercase tracking-tight text-3xl text-foreground leading-tight">
              {data.player.name}
            </h1>
            {data.player.position && (
              <Badge variant="secondary" className="mt-1">{data.player.position}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-foreground">
            <LanguageToggle />
            <PortalNotificationsToggle token={token} vapidPublicKey={data.vapidPublicKey} />
          </div>
        </header>

        {data.stats && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                {t("portal.seasonStats")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3 text-center">
                {statTiles.map(([label, value]) => (
                  <div key={label}>
                    <p className="font-display font-bold text-2xl tabular-nums text-foreground">{value}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              {t("portal.upcomingPractices")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcomingSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("portal.noUpcomingPractices")}</p>
            ) : (
              <ul className="space-y-2">
                {data.upcomingSessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between text-sm border-b border-border last:border-0 pb-2 last:pb-0"
                  >
                    <div>
                      <p className="font-medium text-foreground">{s.name}</p>
                      <p className="text-muted-foreground">{formatDate(s.date)} · {s.time}</p>
                    </div>
                    <span className="text-muted-foreground whitespace-nowrap">{t("sessionModal.minAbbrev", { count: s.duration })}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              {t("portal.upcomingGames")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcomingGames.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("portal.noUpcomingGames")}</p>
            ) : (
              <ul className="space-y-2">
                {data.upcomingGames.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center justify-between text-sm border-b border-border last:border-0 pb-2 last:pb-0"
                  >
                    <p className="font-medium text-foreground">{t("portal.vsOpponent", { opponent: g.opponent })}</p>
                    <div className="text-right text-muted-foreground">
                      <p>{formatDate(g.date)}</p>
                      {g.location && <p className="capitalize text-xs">{g.location}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              {t("portal.recentAttendance")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.attendance.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("portal.noAttendanceRecorded")}</p>
            ) : (
              <ul className="space-y-2">
                {data.attendance.map((a, index) => (
                  // sessionId alone isn't guaranteed unique here — attendance
                  // has no (sessionId, playerId) uniqueness constraint
                  // server-side, so a session marked twice for this player
                  // would otherwise collide.
                  <li key={`${a.sessionId}-${index}`} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium text-foreground">{a.sessionName}</p>
                      <p className="text-muted-foreground text-xs">{formatDate(a.date)}</p>
                    </div>
                    <Badge variant="outline" className={`capitalize ${ATTENDANCE_BADGE[a.status] ?? ""}`}>
                      {t(`attendanceModal.${a.status}`, a.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* The only outward-facing surface of the app that a non-coach ever
            sees — every visit here is a free, already-warm lead. A quiet
            footer instead of a banner: it should read as a credit line, not
            an ad, so it doesn't undercut the "this is my kid's coach's app"
            trust this page runs on. */}
        <footer className="pt-2 text-center space-y-1">
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            {t("portal.poweredByPrefix")}
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <BrandMark className="w-3 h-3" />
              Coach Hub
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
