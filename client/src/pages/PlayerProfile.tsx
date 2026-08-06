import { useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Star, MessageSquarePlus, Trash2, Menu, CheckCircle2, TrendingUp, HeartPulse, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import StatCard from "@/components/StatCard";
import SkillRadarChart from "@/components/SkillRadarChart";
import RatePlayerDialog from "@/components/RatePlayerDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import ErrorState from "@/components/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useSidebar } from "@/hooks/use-sidebar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { SKILL_CATEGORIES } from "@shared/schema";
import type { Player, PlayerDevelopment, PlayerGameStatsSummary, PlayerInjury } from "@shared/schema";

const todayISO = () => new Date().toISOString().slice(0, 10);

// `createdAt`/`ratedAt` are typed Date in the DB schema, but arrive over the
// wire as ISO strings once JSON-serialized — accepting both here means
// callers don't need an awkward cast at every use site.
function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Groups the flat rating history back into per-evaluation rows (see
// createSkillRating — all 5 categories in one submission share one ratedAt),
// newest first, for a compact "what changed over time" table.
function groupHistory(history: PlayerDevelopment["history"]): { ratedAt: string; ratings: Record<string, number> }[] {
  const byTimestamp = new Map<string, Record<string, number>>();
  for (const row of history) {
    if (!byTimestamp.has(row.ratedAt)) byTimestamp.set(row.ratedAt, {});
    byTimestamp.get(row.ratedAt)![row.category] = row.rating;
  }
  return Array.from(byTimestamp.entries())
    .map(([ratedAt, ratings]) => ({ ratedAt, ratings }))
    .sort((a, b) => new Date(b.ratedAt).getTime() - new Date(a.ratedAt).getTime());
}

export default function PlayerProfile() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const playerId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const { openMobile } = useSidebar();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isRateOpen, setIsRateOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteToDelete, setNoteToDelete] = useState<number | null>(null);
  const [injuryDescription, setInjuryDescription] = useState("");
  const [injuryDate, setInjuryDate] = useState(todayISO());
  const [injuryToDelete, setInjuryToDelete] = useState<number | null>(null);

  const { data: players = [], isLoading: isLoadingPlayers } = useQuery<Player[]>({ queryKey: ["/api/players"] });
  const player = useMemo(() => players.find((p) => p.id === playerId), [players, playerId]);

  const { data: development, isLoading: isLoadingDev, isError, refetch } = useQuery<PlayerDevelopment>({
    queryKey: [`/api/players/${playerId}/development`],
    enabled: !isNaN(playerId),
  });

  const { data: attendanceStats } = useQuery<{ total: number; present: number; absent: number; rate: number }>({
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

  const addNoteMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/players/${playerId}/notes`, { content: noteDraft.trim() }),
    onSuccess: () => {
      setNoteDraft("");
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/development`] });
    },
    onError: (error) => {
      toast({ title: t("playerProfile.couldntAddNote"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: number) => apiRequest("DELETE", `/api/players/${playerId}/notes/${noteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/development`] });
    },
    onError: (error) => {
      toast({ title: t("playerProfile.couldntDeleteNote"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    },
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

  const deleteInjuryMutation = useMutation({
    mutationFn: async (injuryId: number) => apiRequest("DELETE", `/api/players/${playerId}/injuries/${injuryId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/injuries`] });
      queryClient.invalidateQueries({ queryKey: ["/api/players/injuries"] });
    },
    onError: (error) => {
      toast({ title: t("playerProfile.couldntDeleteInjury"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    },
  });

  const historyGroups = useMemo(() => (development ? groupHistory(development.history) : []), [development]);

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
      <header className="bg-card border-b border-border px-4 py-4 lg:px-7 lg:py-5">
        <div className="flex items-center gap-3">
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
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display font-bold uppercase tracking-tight text-2xl lg:text-3xl text-foreground leading-tight">
                {player.name}
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
            {player.position && <p className="text-sm text-muted-foreground mt-0.5">{player.position}</p>}
          </div>
          <Button onClick={() => setIsRateOpen(true)} className="basketball-orange basketball-orange-hover text-white whitespace-nowrap">
            <Star className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
            <span className="hidden sm:inline">{t("playerProfile.ratePlayer")}</span>
            <span className="sm:hidden">{t("playerProfile.rate")}</span>
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label={t("playerProfile.attendanceRate")} value={`${attendanceStats?.rate ?? 0}%`} icon={CheckCircle2} color="success" />
          <StatCard label={t("playerProfile.gamesPlayed")} value={gameStats?.gamesPlayed ?? 0} icon={TrendingUp} color="court" />
          <StatCard label={t("playerProfile.seasonPoints")} value={gameStats?.points ?? 0} icon={Star} color="orange" />
          <StatCard label={t("playerProfile.seasonAssists")} value={gameStats?.assists ?? 0} icon={MessageSquarePlus} color="violet" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("playerProfile.skillDevelopment")}</CardTitle>
            </CardHeader>
            <CardContent>
              <SkillRadarChart ratings={development?.current ?? null} />
              {!development?.current && (
                <p className="text-sm text-muted-foreground text-center mt-2">
                  {t("playerProfile.noRatingsYet")}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("playerProfile.ratingHistory")}</CardTitle>
            </CardHeader>
            <CardContent>
              {historyGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("playerProfile.noEvaluationsYet")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">{t("playerProfile.date")}</th>
                        {SKILL_CATEGORIES.map((cat) => (
                          <th key={cat} className="pb-2 pr-3 font-medium text-center">{t(`categories.exercise.${cat}`, cat).slice(0, 3)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {historyGroups.map((row) => (
                        <tr key={row.ratedAt} className="border-t border-border">
                          <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{formatDateTime(row.ratedAt)}</td>
                          {SKILL_CATEGORIES.map((cat) => (
                            <td key={cat} className="py-2 pr-3 text-center tabular-nums font-medium text-foreground">
                              {row.ratings[cat] ?? "–"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

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

            {injuries.length > 0 ? (
              <ul className="space-y-3">
                {injuries.map((injury) => (
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

            {development && development.notes.length > 0 ? (
              <ul className="space-y-3">
                {development.notes.map((note) => (
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

      <RatePlayerDialog
        playerId={isRateOpen ? playerId : null}
        playerName={player.name}
        onOpenChange={(open) => setIsRateOpen(open)}
      />

      <ConfirmDialog
        open={noteToDelete !== null}
        onOpenChange={(open) => !open && setNoteToDelete(null)}
        title={t("playerProfile.deleteNoteConfirmTitle")}
        description={t("playerProfile.deleteNoteConfirmDescription")}
        onConfirm={() => {
          if (noteToDelete !== null) deleteNoteMutation.mutate(noteToDelete);
          setNoteToDelete(null);
        }}
      />

      <ConfirmDialog
        open={injuryToDelete !== null}
        onOpenChange={(open) => !open && setInjuryToDelete(null)}
        title={t("playerProfile.deleteInjuryConfirmTitle")}
        description={t("playerProfile.deleteInjuryConfirmDescription")}
        onConfirm={() => {
          if (injuryToDelete !== null) deleteInjuryMutation.mutate(injuryToDelete);
          setInjuryToDelete(null);
        }}
      />
    </div>
  );
}
