import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Users, CalendarDays, TrendingUp, ShieldAlert, Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import TopBar from "@/components/TopBar";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import type { Club, ClubTeamOverview } from "@shared/schema";

// The aggregate view a director/club-admin never had before: every team
// under the account's roster, sessions, and attendance side by side, instead
// of switching teams one at a time to piece the same picture together by
// hand. Read-only — editing the club's name/logo stays in Manage Coaches
// (owner-only), this page is for both the owner and any coach who joined.
export default function ClubOverview() {
  const { t } = useTranslation();
  const { account } = useAuth();

  const { data: club, isLoading: isLoadingClub } = useQuery<Club | null>({
    queryKey: ["/api/club"],
    enabled: !!account?.isClubMember || account?.plan === "club",
  });
  const { data: teams, isLoading: isLoadingTeams, isError } = useQuery<ClubTeamOverview[]>({
    queryKey: ["/api/club/overview"],
    enabled: !!account?.isClubMember || account?.plan === "club",
  });

  const totals = useMemo(() => {
    if (!teams || teams.length === 0) return null;
    const activePlayersCount = teams.reduce((sum, t) => sum + t.activePlayersCount, 0);
    const totalSessions = teams.reduce((sum, t) => sum + t.totalSessions, 0);
    // Weighted by each team's session count, not a flat average across
    // teams — a team with 20 sessions should move the club-wide number more
    // than a team with 2.
    const avgAttendance = totalSessions > 0
      ? Math.round(teams.reduce((sum, t) => sum + t.avgAttendance * t.totalSessions, 0) / totalSessions)
      : 0;
    return { activePlayersCount, totalSessions, avgAttendance };
  }, [teams]);

  const isClubPlan = account?.plan === "club" || account?.isClubMember;
  const isLoading = isLoadingClub || isLoadingTeams;

  if (!isClubPlan) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title={t("clubOverview.title")} subtitle="" />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 fade-in">
          <EmptyState icon={ShieldAlert} title={t("clubOverview.notAvailable")} description={t("clubOverview.notAvailableDescription")} />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar title={club?.name || t("clubOverview.title")} subtitle={t("clubOverview.subtitle")} />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6 fade-in space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <Skeleton className="h-48" />
          </div>
        ) : isError ? (
          <EmptyState icon={ShieldAlert} title={t("clubOverview.couldntLoad")} description={t("clubOverview.couldntLoadDescription")} />
        ) : !teams || teams.length === 0 ? (
          <EmptyState icon={Building2} title={t("clubOverview.emptyTitle")} description={t("clubOverview.emptyDescription")} />
        ) : (
          <>
            {!club?.name && (
              <Card className="border-basketball-orange/30">
                <CardContent className="p-4 text-sm text-muted-foreground">
                  {t("clubOverview.nameYourClubPrefix")}{" "}
                  <Link href="/settings/coaches" className="text-basketball-orange font-medium hover:underline">
                    {t("clubOverview.nameYourClubLink")}
                  </Link>
                </CardContent>
              </Card>
            )}

            {totals && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label={t("clubOverview.totalActivePlayers")} value={totals.activePlayersCount} icon={Users} color="court" />
                <StatCard label={t("clubOverview.totalSessions")} value={totals.totalSessions} icon={CalendarDays} color="violet" />
                <StatCard label={t("clubOverview.avgAttendance")} value={`${totals.avgAttendance}%`} icon={TrendingUp} color="success" />
              </div>
            )}

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="p-4 font-medium">{t("clubOverview.team")}</th>
                        <th className="p-4 font-medium text-right">{t("clubOverview.activePlayers")}</th>
                        <th className="p-4 font-medium text-right">{t("clubOverview.sessions")}</th>
                        <th className="p-4 font-medium text-right">{t("clubOverview.attendance")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teams.map((team) => (
                        <tr key={team.teamId} className="border-b border-border last:border-0">
                          <td className="p-4 font-medium text-foreground">{team.teamName}</td>
                          <td className="p-4 text-right tabular-nums">{team.activePlayersCount}</td>
                          <td className="p-4 text-right tabular-nums">{team.totalSessions}</td>
                          <td className="p-4 text-right tabular-nums">{team.avgAttendance}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
