import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, MapPin, Trash2, Plus, Trophy, Menu, BellRing, Percent, TrendingUp, TrendingDown, Flame } from "lucide-react";
import { useTranslation } from "react-i18next";
import GameModal from "@/components/GameModal";
import PlayerStatsTable from "@/components/PlayerStatsTable";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import StatCard from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/use-sidebar";
import { useDeleteWithUndo } from "@/hooks/use-delete-with-undo";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { computeSeasonRecord } from "@/lib/seasonRecord";
import type { Game } from "@shared/schema";

// Local midnight, formatted as the same "YYYY-MM-DD" the API stores dates
// as — so a same-day game still counts as "upcoming" until it's actually over.
function todayISO(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function resultBadge(game: Game, t: (key: string) => string) {
  if (game.teamScore == null || game.opponentScore == null) return null;
  if (game.teamScore === game.opponentScore) {
    return <Badge variant="secondary">{t("games.tie")}</Badge>;
  }
  const won = game.teamScore > game.opponentScore;
  return (
    <Badge className={won ? "bg-success text-white hover:bg-success" : "bg-red-600 text-white hover:bg-red-600"}>
      {won ? t("games.win") : t("games.loss")}
    </Badge>
  );
}

export default function Games() {
  const { t } = useTranslation();
  const { openMobile } = useSidebar();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [gameToDelete, setGameToDelete] = useState<Game | null>(null);
  const [tab, setTab] = useState<"games" | "stats">("games");

  const { data: games = [], isLoading, isError, refetch } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  const { requestDelete, isPendingDelete } = useDeleteWithUndo({
    endpoint: "/api/games",
    errorMessage: t("games.failedToDelete"),
  });

  const { toast } = useToast();
  const notifyMutation = useMutation({
    mutationFn: async (gameId: number) => {
      const res = await apiRequest("POST", `/api/games/${gameId}/notify`);
      return (await res.json()) as { sent: number };
    },
    onSuccess: (data) => {
      toast({
        title: data.sent > 0 ? t("sessions.reminderSent") : t("sessions.noOneToNotify"),
        description: data.sent > 0
          ? t("sessions.notifiedCount", { count: data.sent })
          : t("sessions.noPlayersNotifications"),
      });
    },
    onError: (error) => {
      toast({
        title: t("sessions.couldntSendReminder"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const sortedGames = useMemo(() => {
    return games
      .filter((g) => !isPendingDelete(g.id))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [games, isPendingDelete]);

  const { wins, losses, ties, winPct, avgPointDiff, streak } = useMemo(() => computeSeasonRecord(games), [games]);
  const hasDecidedGames = wins + losses + ties > 0;

  const confirmDeleteGame = () => {
    if (gameToDelete) {
      requestDelete(gameToDelete.id, t("games.deletedToast", { opponent: gameToDelete.opponent }));
      setGameToDelete(null);
    }
  };

  // pt-[max(...)] reserves space under iOS's black-translucent status bar
  // when this app is added to the home screen — see TopBar.tsx.
  const header = (
    <header className="bg-card border-b border-border px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 lg:px-7 lg:pt-[max(1.25rem,env(safe-area-inset-top))] lg:pb-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={openMobile}
            className="lg:hidden w-11 h-11 flex-shrink-0 basketball-orange rounded-md flex items-center justify-center"
            aria-label={t("common.openNavigationMenu")}
          >
            <Menu className="w-4 h-4 text-white" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <div>
            <h2 className="font-display font-bold uppercase tracking-tight text-2xl lg:text-3xl text-foreground leading-tight">{t("nav.games")}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {games.length > 0 ? t("games.record", { wins, losses, ties: ties > 0 ? `-${ties}` : "" }) : t("games.trackResults")}
            </p>
          </div>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="basketball-orange basketball-orange-hover text-white whitespace-nowrap">
          <Plus className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
          <span className="hidden sm:inline">{t("games.newGame")}</span>
          <span className="sm:hidden">{t("topBar.new")}</span>
        </Button>
      </div>
    </header>
  );

  const tabBar = (
    <div className="flex gap-1 border-b border-border px-4 lg:px-6">
      {(["games", "stats"] as const).map((tabKey) => (
        <button
          key={tabKey}
          type="button"
          onClick={() => setTab(tabKey)}
          className={cn(
            "px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === tabKey
              ? "border-basketball-orange text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tabKey === "games" ? t("nav.games") : t("games.playerStats")}
        </button>
      ))}
    </div>
  );

  if (isError) {
    return (
      <div className="flex flex-col h-full">
        {header}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorState onRetry={() => refetch()} />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {header}
      {tabBar}

      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        {tab === "stats" ? (
          <PlayerStatsTable />
        ) : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : sortedGames.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title={t("games.emptyTitle")}
            description={t("games.emptyDescription")}
            action={{ label: t("games.logFirstGame"), icon: Plus, onClick: () => setIsCreateOpen(true) }}
          />
        ) : (
          <>
          {hasDecidedGames && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard
                label={t("games.statsRecord")}
                value={`${wins}-${losses}${ties > 0 ? `-${ties}` : ""}`}
                icon={Trophy}
                color="orange"
              />
              <StatCard
                label={t("games.statsWinPct")}
                value={winPct !== null ? `${winPct}%` : "–"}
                icon={Percent}
                color="success"
              />
              <StatCard
                label={t("games.statsPointDiff")}
                value={avgPointDiff !== null ? `${avgPointDiff > 0 ? "+" : ""}${avgPointDiff.toFixed(1)}` : "–"}
                icon={avgPointDiff !== null && avgPointDiff < 0 ? TrendingDown : TrendingUp}
                color="court"
              />
              <StatCard
                label={t("games.statsStreak")}
                value={streak ? `${streak.won ? "W" : "L"}${streak.count}` : "–"}
                icon={Flame}
                color="violet"
              />
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedGames.map((game, index) => (
              <Card
                key={game.id}
                className="fade-in hover:border-basketball-orange hover:shadow-md hover:-translate-y-0.5 transition-all"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="font-display uppercase tracking-tight text-lg text-foreground mb-1">
                        {t("games.vsOpponent", { opponent: game.opponent })}
                      </CardTitle>
                      <div className="flex items-center text-sm text-muted-foreground gap-3">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                          {new Date(`${game.date}T00:00:00`).toLocaleDateString()}
                        </span>
                        {game.location && (
                          <span className="flex items-center gap-1 capitalize">
                            <MapPin className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                            {game.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-1">
                      {game.date >= todayISO() && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => notifyMutation.mutate(game.id)}
                          disabled={notifyMutation.isPending}
                          aria-label={t("games.notifyPlayersAbout", { opponent: game.opponent })}
                          title={t("sessions.sendReminderTitle")}
                        >
                          <BellRing className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700 dark:hover:text-red-400"
                        onClick={() => setGameToDelete(game)}
                        aria-label={t("games.deleteGameVs", { opponent: game.opponent })}
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t("games.score")}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-bold text-xl tabular-nums text-foreground">
                        {game.teamScore ?? "–"}<span className="text-muted-foreground mx-1">-</span>{game.opponentScore ?? "–"}
                      </span>
                      {resultBadge(game, t)}
                    </div>
                  </div>
                  {game.notes && (
                    <p className="text-sm text-foreground line-clamp-2">{game.notes}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          </>
        )}
      </main>

      {isCreateOpen && <GameModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />}

      <ConfirmDialog
        open={!!gameToDelete}
        onOpenChange={(open) => !open && setGameToDelete(null)}
        title={t("games.deleteConfirmTitle")}
        description={t("games.deleteConfirmDescription", { opponent: gameToDelete?.opponent })}
        onConfirm={confirmDeleteGame}
      />
    </div>
  );
}
