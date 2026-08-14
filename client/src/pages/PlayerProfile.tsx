import { useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Star, Plus, MessageSquarePlus, Trash2, Menu, CheckCircle2, TrendingUp, HeartPulse, Check, Target, Gauge, FileDown, Loader2, Activity, Crown, Phone, Clock, Calendar, Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";
import StatCard from "@/components/StatCard";
import ShotChart from "@/components/ShotChart";
import QuickAddEvaluationResultDialog from "@/components/QuickAddEvaluationResultDialog";
import EvaluationScoreChart from "@/components/EvaluationScoreChart";
import ConfirmDialog from "@/components/ConfirmDialog";
import ErrorState from "@/components/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useSidebar } from "@/hooks/use-sidebar";
import { useDeleteWithUndo } from "@/hooks/use-delete-with-undo";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { exportSeasonReportPdf } from "@/lib/exportSeasonReportPdf";
import { calculateAge, formatPlainDate } from "@/lib/time";
import { computeEvaluationScore } from "@shared/evaluationScore";
import PhysicalTestChart from "@/components/PhysicalTestChart";
import type { Player, PlayerNote, PlayerGameStatsSummary, PlayerInjury, DrillAttempt, PlayerPhysicalTestHistory, PlayerEvaluationTestHistory } from "@shared/schema";

const todayISO = () => new Date().toISOString().slice(0, 10);

// `createdAt`/`ratedAt` are typed Date in the DB schema, but arrive over the
// wire as ISO strings once JSON-serialized — accepting both here means
// callers don't need an awkward cast at every use site.
function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// A "YYYY-MM" bucket key (from the attendance monthly breakdown) rendered as
// "August 2026" — parsed as day 1 at local midnight for the same reason as
// formatPlainDate (lib/time).
function formatMonthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function PlayerProfile() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const playerId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const { openMobile } = useSidebar();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isAddResultOpen, setIsAddResultOpen] = useState(false);
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteToDelete, setNoteToDelete] = useState<number | null>(null);
  const [injuryDescription, setInjuryDescription] = useState("");
  const [injuryDate, setInjuryDate] = useState(todayISO());
  const [injuryToDelete, setInjuryToDelete] = useState<number | null>(null);

  const { data: players = [], isLoading: isLoadingPlayers } = useQuery<Player[]>({ queryKey: ["/api/players"] });
  const player = useMemo(() => players.find((p) => p.id === playerId), [players, playerId]);

  const { data: evaluationHistory = [], isLoading: isLoadingDev, isError, refetch } = useQuery<PlayerEvaluationTestHistory[]>({
    queryKey: [`/api/players/${playerId}/evaluation-results`],
    enabled: !isNaN(playerId),
  });

  const { data: attendanceStats } = useQuery<{
    total: number; present: number; absent: number; rate: number;
    totalHoursTrained: number;
    monthly: { month: string; present: number; absent: number }[];
  }>({
    queryKey: [`/api/players/${playerId}/attendance-stats`],
    enabled: !isNaN(playerId),
  });

  const { data: allStats = [] } = useQuery<PlayerGameStatsSummary[]>({ queryKey: ["/api/players/stats"] });
  const gameStats = useMemo(() => allStats.find((s) => s.playerId === playerId), [allStats, playerId]);

  const { data: injuries = [] } = useQuery<PlayerInjury[]>({
    queryKey: [`/api/players/${playerId}/injuries`],
    enabled: !isNaN(playerId),
  });
  const hasActiveInjury = injuries.some((i) => i.status === "active");

  const { data: drillAttempts = [] } = useQuery<DrillAttempt[]>({
    queryKey: [`/api/players/${playerId}/drill-attempts`],
    enabled: !isNaN(playerId),
  });
  const { data: physicalTestHistory = [] } = useQuery<PlayerPhysicalTestHistory[]>({
    queryKey: [`/api/players/${playerId}/physical-test-results`],
    enabled: !isNaN(playerId),
  });

  const [expandedDrill, setExpandedDrill] = useState<string | null>(null);
  const [expandedTest, setExpandedTest] = useState<number | null>(null);
  const [expandedEvaluationTest, setExpandedEvaluationTest] = useState<number | null>(null);

  // Overall standing: the average of each test's latest score, rounded —
  // same idea as the roster-wide scrimmage-balancer average, just for one
  // player. Undefined until the player has at least one evaluation result.
  const overallScore = useMemo(() => {
    if (evaluationHistory.length === 0) return null;
    const latestScores = evaluationHistory.map((test) => computeEvaluationScore(test.results[0].value, test.worstValue, test.bestValue));
    return Math.round(latestScores.reduce((sum, score) => sum + score, 0) / latestScores.length);
  }, [evaluationHistory]);
  const drillSummary = useMemo(() => {
    const byDrill = new Map<string, { made: number; total: number; shots: { id: number; x: number; y: number; made: number }[] }>();
    for (const attempt of drillAttempts) {
      const entry = byDrill.get(attempt.drillName) ?? { made: 0, total: 0, shots: [] };
      entry.total += 1;
      if (attempt.made === 1) entry.made += 1;
      if (attempt.x !== null && attempt.y !== null) {
        entry.shots.push({ id: attempt.id, x: attempt.x, y: attempt.y, made: attempt.made });
      }
      byDrill.set(attempt.drillName, entry);
    }
    return Array.from(byDrill.entries())
      .map(([drillName, { made, total, shots }]) => ({ drillName, made, total, shots, pct: total > 0 ? Math.round((made / total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [drillAttempts]);

  const handleExportSeasonReport = async () => {
    if (!player || !attendanceStats || isExportingReport) return;
    setIsExportingReport(true);
    try {
      await exportSeasonReportPdf(player, attendanceStats, evaluationHistory, gameStats, drillAttempts);
    } catch (error) {
      toast({ title: t("playerProfile.couldntExportReport"), description: t("common.tryAgain"), variant: "destructive" });
    } finally {
      setIsExportingReport(false);
    }
  };

  const addNoteMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/players/${playerId}/notes`, { content: noteDraft.trim() }),
    onSuccess: () => {
      setNoteDraft("");
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/notes`] });
    },
    onError: (error) => {
      toast({ title: t("playerProfile.couldntAddNote"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    },
  });

  // Undo-toast pattern shared with every other delete flow in the app
  // (exercises, plays, physical tests, games, sessions, recurring slots) —
  // hides the note immediately and only fires the DELETE if the undo
  // window passes without the coach clicking "Undo".
  const { requestDelete: requestDeleteNote, isPendingDelete: isNotePendingDelete } = useDeleteWithUndo({
    endpoint: `/api/players/${playerId}/notes`,
    errorMessage: t("playerProfile.couldntDeleteNote"),
  });

  const reportInjuryMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/players/${playerId}/injuries`, { description: injuryDescription.trim(), reportedDate: injuryDate }),
    onSuccess: () => {
      setInjuryDescription("");
      setInjuryDate(todayISO());
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/injuries`] });
      queryClient.invalidateQueries({ queryKey: ["/api/players/injuries"] });
    },
    onError: (error) => {
      toast({ title: t("playerProfile.couldntReportInjury"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    },
  });

  const recoverInjuryMutation = useMutation({
    mutationFn: async (injuryId: number) =>
      apiRequest("PUT", `/api/players/${playerId}/injuries/${injuryId}/recover`, { recoveredDate: todayISO() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/injuries`] });
      queryClient.invalidateQueries({ queryKey: ["/api/players/injuries"] });
    },
    onError: (error) => {
      toast({ title: t("playerProfile.couldntUpdateInjury"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    },
  });

  const { requestDelete: requestDeleteInjury, isPendingDelete: isInjuryPendingDelete } = useDeleteWithUndo({
    endpoint: `/api/players/${playerId}/injuries`,
    errorMessage: t("playerProfile.couldntDeleteInjury"),
    extraInvalidateKeys: ["/api/players/injuries"],
  });

  const { data: notes = [] } = useQuery<PlayerNote[]>({
    queryKey: [`/api/players/${playerId}/notes`],
    enabled: !isNaN(playerId),
  });

  if (isLoadingPlayers || isLoadingDev) {
    return (
      <div className="flex flex-col h-full">
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </main>
      </div>
    );
  }

  if (isError || !player) {
    return (
      <div className="flex flex-col h-full">
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorState
            title={t("playerProfile.couldntLoadPlayer")}
            description={t("playerProfile.couldntLoadPlayerDescription")}
            onRetry={() => refetch()}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* pt-[max(...)] reserves space under iOS's black-translucent status
          bar when this app is added to the home screen — see TopBar.tsx. */}
      <header className="bg-card border-b border-border px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 lg:px-7 lg:pt-[max(1.25rem,env(safe-area-inset-top))] lg:pb-5">
        {/* Two rows on mobile, one on desktop (lg:flex-row) — same pattern
            TopBar uses. A long player name can wrap the identity block onto
            multiple lines; keeping it stacked above the action buttons
            (rather than sharing one non-wrapping row) means that growth
            pushes the buttons down instead of the buttons sitting on top of
            the wrapped text. */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={openMobile}
              className="lg:hidden w-11 h-11 flex-shrink-0 basketball-orange rounded-md flex items-center justify-center"
              aria-label={t("common.openNavigationMenu")}
            >
              <Menu className="w-4 h-4 text-white" strokeWidth={1.75} aria-hidden="true" />
            </button>
            <Button variant="ghost" size="icon" onClick={() => setLocation("/players")} aria-label={t("playerProfile.backToPlayers")}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            </Button>
            <div className="w-12 h-12 lg:w-14 lg:h-14 flex-shrink-0 rounded-full bg-basketball-orange/10 border-2 border-basketball-orange/20 flex items-center justify-center font-display font-bold text-basketball-orange text-lg">
              {player.jerseyNumber != null
                ? `#${player.jerseyNumber}`
                : player.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display font-bold uppercase tracking-tight text-2xl lg:text-3xl text-foreground leading-tight flex items-center gap-2">
                  {player.name}
                  {player.isCaptain === 1 && (
                    <Crown className="w-5 h-5 text-basketball-orange shrink-0" strokeWidth={2} role="img" aria-label={t("players.captainBadge")} />
                  )}
                </h2>
                <Badge
                  variant={player.isActive === 1 ? "default" : "secondary"}
                  className={player.isActive === 1 ? "bg-success-tint text-success" : ""}
                >
                  {player.isActive === 1 ? t("players.active") : t("players.inactive")}
                </Badge>
                {hasActiveInjury && (
                  <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/40">
                    <HeartPulse className="w-3 h-3 mr-1" strokeWidth={1.75} aria-hidden="true" />
                    {t("playerProfile.injured")}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {[
                  player.position,
                  player.birthDate ? t("players.ageValue", { count: calculateAge(player.birthDate) ?? 0 }) : null,
                  player.height ? t("players.heightValue", { count: player.height }) : null,
                  player.dominantHand ? t(`playerForm.dominantHandOptions.${player.dominantHand}`) : null,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              onClick={handleExportSeasonReport}
              disabled={isExportingReport || !attendanceStats}
              className="whitespace-nowrap"
            >
              {isExportingReport ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" />
              ) : (
                <FileDown className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{t("playerProfile.seasonReport")}</span>
              <span className="sm:hidden">{t("playerProfile.report")}</span>
            </Button>
            <Button onClick={() => setIsAddResultOpen(true)} className="basketball-orange basketball-orange-hover text-white whitespace-nowrap">
              <Plus className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
              <span className="hidden sm:inline">{t("playerProfile.addResult")}</span>
              <span className="sm:hidden">{t("playerProfile.addResultShort")}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 fade-in">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label={t("playerProfile.attendanceRate")} value={`${attendanceStats?.rate ?? 0}%`} icon={CheckCircle2} color="success" />
          <StatCard label={t("playerProfile.hoursTrained")} value={attendanceStats?.totalHoursTrained ?? 0} icon={Clock} color="violet" />
          <StatCard label={t("playerProfile.gamesPlayed")} value={gameStats?.gamesPlayed ?? 0} icon={TrendingUp} color="court" />
          <StatCard label={t("playerProfile.seasonPoints")} value={gameStats?.points ?? 0} icon={Star} color="orange" />
          <StatCard label={t("playerProfile.seasonAssists")} value={gameStats?.assists ?? 0} icon={MessageSquarePlus} color="violet" />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="w-4 h-4 text-basketball-orange" strokeWidth={1.75} aria-hidden="true" />
              {t("playerProfile.evaluations")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {evaluationHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("playerProfile.noEvaluationsYet")}</p>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-4 pb-4 border-b border-border">
                  <span className="font-display font-bold text-4xl text-basketball-orange tabular-nums">{overallScore}</span>
                  <span className="text-sm text-muted-foreground">{t("playerProfile.overallScoreOutOf100")}</span>
                </div>
                <ul className="space-y-2.5">
                  {evaluationHistory.map((test) => {
                    const latest = test.results[0];
                    const score = computeEvaluationScore(latest.value, test.worstValue, test.bestValue);
                    const canExpand = test.results.length > 1;
                    const isExpanded = expandedEvaluationTest === test.testId;
                    return (
                      <li key={test.testId} className="border-t border-border pt-2.5 first:border-0 first:pt-0">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            {canExpand ? (
                              <button
                                type="button"
                                className="font-medium text-foreground truncate underline decoration-dotted underline-offset-2 text-left"
                                onClick={() => setExpandedEvaluationTest(isExpanded ? null : test.testId)}
                                aria-expanded={isExpanded}
                              >
                                {test.testName}
                              </button>
                            ) : (
                              <span className="font-medium text-foreground truncate">{test.testName}</span>
                            )}
                            <span className="text-xs text-muted-foreground ml-2 whitespace-nowrap">{formatPlainDate(latest.date)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0 tabular-nums">
                            <span className="font-semibold text-foreground">{score}</span>
                            <span className="text-xs text-muted-foreground">({latest.value} {test.unit})</span>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="mt-2">
                            <EvaluationScoreChart results={[...test.results].reverse()} unit={test.unit} worstValue={test.worstValue} bestValue={test.bestValue} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        {attendanceStats && attendanceStats.monthly.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4 text-basketball-orange" strokeWidth={1.75} aria-hidden="true" />
                {t("playerProfile.monthlyAttendance")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {[...attendanceStats.monthly].reverse().map((row) => {
                  const monthTotal = row.present + row.absent;
                  const monthRate = monthTotal > 0 ? Math.round((row.present / monthTotal) * 100) : 0;
                  return (
                    <li key={row.month} className="flex items-center justify-between gap-3 text-sm border-t border-border pt-2 first:border-0 first:pt-0">
                      <span className="font-medium text-foreground">{formatMonthLabel(row.month)}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {t("playerProfile.monthlyAttendanceTally", { present: row.present, total: monthTotal, pct: monthRate })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}

        {(player.emergencyContactName || player.emergencyContactPhone || player.medicalNotes) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Phone className="w-4 h-4 text-basketball-orange" strokeWidth={1.75} aria-hidden="true" />
                {t("playerProfile.emergencyInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(player.emergencyContactName || player.emergencyContactPhone) && (
                <p>
                  <span className="text-muted-foreground">{t("playerProfile.emergencyContact")}: </span>
                  <span className="text-foreground font-medium">
                    {[player.emergencyContactName, player.emergencyContactPhone].filter(Boolean).join(" — ")}
                  </span>
                </p>
              )}
              {player.medicalNotes && (
                <p>
                  <span className="text-muted-foreground">{t("playerForm.medicalNotes")}: </span>
                  <span className="text-foreground whitespace-pre-wrap">{player.medicalNotes}</span>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-red-600" strokeWidth={1.75} aria-hidden="true" />
              {t("playerProfile.injuries")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={injuryDescription}
                onChange={(e) => setInjuryDescription(e.target.value)}
                placeholder={t("playerProfile.injuryDescriptionPlaceholder")}
                aria-label={t("playerProfile.injuryDescription")}
                className="flex-1"
              />
              <Input
                type="date"
                value={injuryDate}
                onChange={(e) => setInjuryDate(e.target.value)}
                aria-label={t("playerProfile.injuryDate")}
                className="sm:w-40"
              />
              <Button
                type="button"
                onClick={() => reportInjuryMutation.mutate()}
                disabled={!injuryDescription.trim() || !injuryDate || reportInjuryMutation.isPending}
                className="sm:self-end whitespace-nowrap"
              >
                <HeartPulse className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
                {t("playerProfile.reportInjury")}
              </Button>
            </div>

            {injuries.filter((injury) => !isInjuryPendingDelete(injury.id)).length > 0 ? (
              <ul className="space-y-3">
                {injuries.filter((injury) => !isInjuryPendingDelete(injury.id)).map((injury) => (
                  <li key={injury.id} className="flex items-start justify-between gap-3 border-t border-border pt-3 first:border-0 first:pt-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground">{injury.description}</p>
                        <Badge
                          variant="secondary"
                          className={injury.status === "active"
                            ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/40"
                            : "bg-success-tint text-success"}
                        >
                          {injury.status === "active" ? t("playerProfile.injuryActive") : t("playerProfile.injuryRecovered")}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {injury.status === "active"
                          ? t("playerProfile.reportedOn", { date: injury.reportedDate })
                          : t("playerProfile.reportedRecoveredRange", { reported: injury.reportedDate, recovered: injury.recoveredDate })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {injury.status === "active" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-success"
                          onClick={() => recoverInjuryMutation.mutate(injury.id)}
                          disabled={recoverInjuryMutation.isPending}
                          aria-label={t("playerProfile.markRecovered")}
                          title={t("playerProfile.markRecovered")}
                        >
                          <Check className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-red-600"
                        onClick={() => setInjuryToDelete(injury.id)}
                        aria-label={t("playerProfile.deleteInjury")}
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("playerProfile.noInjuriesYet")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-basketball-orange" strokeWidth={1.75} aria-hidden="true" />
              {t("playerProfile.physicalTests")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {physicalTestHistory.length > 0 ? (
              <ul className="space-y-2.5">
                {physicalTestHistory.map((test) => {
                  const latest = test.results[0];
                  const previous = test.results[1];
                  const delta = previous ? latest.value - previous.value : null;
                  const improved = delta !== null && delta !== 0 ? (test.lowerIsBetter ? delta < 0 : delta > 0) : null;
                  const best = test.lowerIsBetter ? Math.min(...test.results.map((r) => r.value)) : Math.max(...test.results.map((r) => r.value));
                  const isPersonalRecord = test.results.length > 1 && latest.value === best;
                  const canExpand = test.results.length > 1;
                  const isExpanded = expandedTest === test.testId;
                  return (
                    <li key={test.testId} className="border-t border-border pt-2.5 first:border-0 first:pt-0">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          {canExpand ? (
                            <button
                              type="button"
                              className="font-medium text-foreground truncate underline decoration-dotted underline-offset-2 text-left"
                              onClick={() => setExpandedTest(isExpanded ? null : test.testId)}
                              aria-expanded={isExpanded}
                            >
                              {test.testName}
                            </button>
                          ) : (
                            <span className="font-medium text-foreground truncate">{test.testName}</span>
                          )}
                          {/* whitespace-nowrap: without it, a narrow column
                              wraps mid-date ("Aug 1," / "2026" on separate
                              lines) instead of moving the whole date down as
                              one unit. */}
                          <span className="text-xs text-muted-foreground ml-2 whitespace-nowrap">{formatPlainDate(latest.date)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 tabular-nums">
                          {isPersonalRecord && (
                            <Trophy className="w-3.5 h-3.5 text-basketball-orange" strokeWidth={1.75} aria-label={t("playerProfile.personalRecord")} />
                          )}
                          <span className="font-semibold text-foreground">{latest.value} {test.unit}</span>
                          {delta !== null && delta !== 0 && (
                            <span className={improved ? "text-success" : "text-red-600"}>
                              {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="mt-2">
                          <PhysicalTestChart results={[...test.results].reverse()} unit={test.unit} lowerIsBetter={test.lowerIsBetter} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("playerProfile.noPhysicalTestsYet")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-basketball-orange" strokeWidth={1.75} aria-hidden="true" />
              {t("playerProfile.drillStats")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {drillSummary.length > 0 ? (
              <ul className="space-y-2.5">
                {drillSummary.map((row) => (
                  <li key={row.drillName}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      {row.shots.length > 0 ? (
                        <button
                          type="button"
                          className="font-medium text-foreground truncate underline decoration-dotted underline-offset-2 text-left"
                          onClick={() => setExpandedDrill(expandedDrill === row.drillName ? null : row.drillName)}
                          aria-expanded={expandedDrill === row.drillName}
                        >
                          {row.drillName}
                        </button>
                      ) : (
                        <span className="font-medium text-foreground truncate">{row.drillName}</span>
                      )}
                      <span className="text-muted-foreground tabular-nums flex-shrink-0">
                        {t("drillTracker.tally", { made: row.made, total: row.total, pct: row.pct })}
                      </span>
                    </div>
                    {expandedDrill === row.drillName && row.shots.length > 0 && (
                      <div className="mt-2 max-w-xs">
                        <ShotChart shots={row.shots} ariaLabel={t("playerProfile.shotChartFor", { drillName: row.drillName })} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("playerProfile.noDrillStatsYet")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("playerProfile.coachNotes")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder={t("playerProfile.notePlaceholder")}
                aria-label={t("playerProfile.newNote")}
                rows={2}
                className="resize-none"
              />
              <Button
                type="button"
                onClick={() => addNoteMutation.mutate()}
                disabled={!noteDraft.trim() || addNoteMutation.isPending}
                className="sm:self-end whitespace-nowrap"
              >
                <MessageSquarePlus className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
                {t("playerProfile.addNote")}
              </Button>
            </div>

            {notes.filter((note) => !isNotePendingDelete(note.id)).length > 0 ? (
              <ul className="space-y-3">
                {notes.filter((note) => !isNotePendingDelete(note.id)).map((note) => (
                  <li key={note.id} className="flex items-start justify-between gap-3 border-t border-border pt-3 first:border-0 first:pt-0">
                    <div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {note.createdAt ? formatDateTime(note.createdAt) : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-red-600 flex-shrink-0"
                      onClick={() => setNoteToDelete(note.id)}
                      aria-label={t("playerProfile.deleteNote")}
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("playerProfile.noNotesYet")}</p>
            )}
          </CardContent>
        </Card>
      </main>

      <QuickAddEvaluationResultDialog
        playerId={isAddResultOpen ? playerId : null}
        playerName={player.name}
        onOpenChange={(open) => setIsAddResultOpen(open)}
      />

      <ConfirmDialog
        open={noteToDelete !== null}
        onOpenChange={(open) => !open && setNoteToDelete(null)}
        title={t("playerProfile.deleteNoteConfirmTitle")}
        description={t("playerProfile.deleteNoteConfirmDescription")}
        onConfirm={() => {
          if (noteToDelete !== null) requestDeleteNote(noteToDelete, t("playerProfile.noteDeletedToast"));
          setNoteToDelete(null);
        }}
      />

      <ConfirmDialog
        open={injuryToDelete !== null}
        onOpenChange={(open) => !open && setInjuryToDelete(null)}
        title={t("playerProfile.deleteInjuryConfirmTitle")}
        description={t("playerProfile.deleteInjuryConfirmDescription")}
        onConfirm={() => {
          if (injuryToDelete !== null) requestDeleteInjury(injuryToDelete, t("playerProfile.injuryDeletedToast"));
          setInjuryToDelete(null);
        }}
      />
    </div>
  );
}
