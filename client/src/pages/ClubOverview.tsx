import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Users, CalendarDays, TrendingUp, ShieldAlert, Building2, Search, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import TopBar from "@/components/TopBar";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import type { Club, ClubTeamOverview, ClubRosterPlayer } from "@shared/schema";

// The aggregate view a director/club-admin never had before: every team
// under the account's roster, sessions, and attendance side by side, instead
// of switching teams one at a time to piece the same picture together by
// hand. Read-only — editing the club's name/logo stays in Manage Coaches
// (owner-only), this page is for both the owner and any coach who joined.
export default function ClubOverview() {
  const { t } = useTranslation();
  const { account, switchTeam } = useAuth();
  const [, setLocation] = useLocation();
  const [rosterSearch, setRosterSearch] = useState("");
  const [rosterTeamFilter, setRosterTeamFilter] = useState<string>("all");

  const { data: club, isLoading: isLoadingClub } = useQuery<Club | null>({
    queryKey: ["/api/club"],
    enabled: !!account?.isClubMember || account?.plan === "club",
  });
  const { data: teams, isLoading: isLoadingTeams, isError } = useQuery<ClubTeamOverview[]>({
    queryKey: ["/api/club/overview"],
    enabled: !!account?.isClubMember || account?.plan === "club",
  });
  const { data: roster, isLoading: isLoadingRoster, isError: isRosterError } = useQuery<ClubRosterPlayer[]>({
    queryKey: ["/api/club/roster"],
    enabled: !!account?.isClubMember || account?.plan === "club",
  });

  // Jumps the coach's own session into that team (same PUT /api/session/team
  // the sidebar's team switcher uses) and lands on its roster — turns this
  // page from a read-only stats dashboard into an actual way to act on a
  // specific team, not just look at its numbers.
  const goToTeam = async (teamId: number) => {
    await switchTeam(teamId);
    setLocation("/players");
  };

  const filteredRoster = useMemo(() => {
    if (!roster) return [];
    const query = rosterSearch.trim().toLowerCase();
    return roster.filter((p) => {
      if (rosterTeamFilter !== "all" && p.teamId.toString() !== rosterTeamFilter) return false;
      if (query && !p.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [roster, rosterSearch, rosterTeamFilter]);

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
                        <th className="p-4 font-medium text-right"><span className="sr-only">{t("clubOverview.clickToManage")}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {teams.map((team) => (
                        <tr
                          key={team.teamId}
                          onClick={() => goToTeam(team.teamId)}
                          className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/50 transition-colors"
                          title={t("clubOverview.clickToManage")}
                        >
                          <td className="p-4 font-medium text-foreground">{team.teamName}</td>
                          <td className="p-4 text-right tabular-nums">{team.activePlayersCount}</td>
                          <td className="p-4 text-right tabular-nums">{team.totalSessions}</td>
                          <td className="p-4 text-right tabular-nums">{team.avgAttendance}%</td>
                          <td className="p-4 text-right">
                            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground inline-block" strokeWidth={1.75} aria-hidden="true" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("clubOverview.roster")}</CardTitle>
                <p className="text-sm text-muted-foreground">{t("clubOverview.rosterSubtitle")}</p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.75} aria-hidden="true" />
                    <Input
                      value={rosterSearch}
                      onChange={(e) => setRosterSearch(e.target.value)}
                      placeholder={t("clubOverview.searchPlaceholder")}
                      aria-label={t("clubOverview.searchPlaceholder")}
                      className="pl-9"
                    />
                  </div>
                  <Select value={rosterTeamFilter} onValueChange={setRosterTeamFilter}>
                    <SelectTrigger className="sm:w-52" aria-label={t("clubOverview.team")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("clubOverview.allTeams")}</SelectItem>
                      {teams.map((team) => (
                        <SelectItem key={team.teamId} value={team.teamId.toString()}>{team.teamName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isLoadingRoster ? (
                  <Skeleton className="h-32" />
                ) : isRosterError ? (
                  <p className="text-sm text-muted-foreground">{t("clubOverview.couldntLoadRoster")}</p>
                ) : filteredRoster.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("clubOverview.noPlayersFound")}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="p-3 font-medium">{t("clubOverview.player")}</th>
                          <th className="p-3 font-medium">{t("clubOverview.team")}</th>
                          <th className="p-3 font-medium">{t("clubOverview.position")}</th>
                          <th className="p-3 font-medium text-right">{t("clubOverview.jersey")}</th>
                          <th className="p-3 font-medium text-right">{t("clubOverview.status")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRoster.map((player) => (
                          <tr
                            key={player.id}
                            onClick={() => goToTeam(player.teamId)}
                            className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/50 transition-colors"
                            title={t("clubOverview.clickToManage")}
                          >
                            <td className="p-3 font-medium text-foreground">{player.name}</td>
                            <td className="p-3 text-muted-foreground">{player.teamName}</td>
                            <td className="p-3 text-muted-foreground">{player.position || "—"}</td>
                            <td className="p-3 text-right tabular-nums">{player.jerseyNumber ?? "—"}</td>
                            <td className="p-3 text-right">
                              <Badge variant={player.isActive ? "secondary" : "outline"} className="text-xs">
                                {player.isActive ? t("clubOverview.active") : t("clubOverview.inactive")}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
