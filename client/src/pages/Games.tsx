import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, MapPin, Trash2, Plus, Trophy, Menu } from "lucide-react";
import GameModal from "@/components/GameModal";
import PlayerStatsTable from "@/components/PlayerStatsTable";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/use-sidebar";
import { useDeleteWithUndo } from "@/hooks/use-delete-with-undo";
import type { Game } from "@shared/schema";

function resultBadge(game: Game) {
  if (game.teamScore == null || game.opponentScore == null) return null;
  if (game.teamScore === game.opponentScore) {
    return <Badge variant="secondary">TIE</Badge>;
  }
  const won = game.teamScore > game.opponentScore;
  return (
    <Badge className={won ? "bg-success text-white hover:bg-success" : "bg-red-600 text-white hover:bg-red-600"}>
      {won ? "W" : "L"}
    </Badge>
  );
}

export default function Games() {
  const { openMobile } = useSidebar();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [gameToDelete, setGameToDelete] = useState<Game | null>(null);
  const [tab, setTab] = useState<"games" | "stats">("games");

  const { data: games = [], isLoading, isError, refetch } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  const { requestDelete, isPendingDelete } = useDeleteWithUndo({
    endpoint: "/api/games",
    errorMessage: "Failed to delete game",
  });

  const sortedGames = useMemo(() => {
    return games
      .filter((g) => !isPendingDelete(g.id))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [games, isPendingDelete]);

  const record = useMemo(() => {
    let wins = 0, losses = 0, ties = 0;
    for (const g of games) {
      if (g.teamScore == null || g.opponentScore == null) continue;
      if (g.teamScore > g.opponentScore) wins++;
      else if (g.teamScore < g.opponentScore) losses++;
      else ties++;
    }
    return { wins, losses, ties };
  }, [games]);

  const confirmDeleteGame = () => {
    if (gameToDelete) {
      requestDelete(gameToDelete.id, `Game vs. ${gameToDelete.opponent} deleted.`);
      setGameToDelete(null);
    }
  };

  const header = (
    <header className="bg-card border-b border-border px-4 py-4 lg:px-7 lg:py-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={openMobile}
            className="lg:hidden w-11 h-11 flex-shrink-0 basketball-orange rounded-md flex items-center justify-center"
            aria-label="Open navigation menu"
          >
            <Menu className="w-4 h-4 text-white" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <div>
            <h2 className="font-display font-bold uppercase tracking-tight text-2xl lg:text-3xl text-foreground leading-tight">Games</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {games.length > 0 ? `Record: ${record.wins}-${record.losses}${record.ties > 0 ? `-${record.ties}` : ""}` : "Track results and box scores"}
            </p>
          </div>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="basketball-orange basketball-orange-hover text-white whitespace-nowrap">
          <Plus className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
          <span className="hidden sm:inline">New Game</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>
    </header>
  );

  const tabBar = (
    <div className="flex gap-1 border-b border-border px-4 lg:px-6">
      {(["games", "stats"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTab(t)}
          className={cn(
            "px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === t
              ? "border-basketball-orange text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t === "games" ? "Games" : "Player Stats"}
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
            title="No Games Logged"
            description="Record your first game — type it in by hand, or upload a photo of the box score."
            action={{ label: "Log First Game", icon: Plus, onClick: () => setIsCreateOpen(true) }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedGames.map((game) => (
              <Card key={game.id} className="hover:border-basketball-orange hover:shadow-sm transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="font-display uppercase tracking-tight text-lg text-foreground mb-1">
                        vs. {game.opponent}
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-700 dark:hover:text-red-400"
                      onClick={() => setGameToDelete(game)}
                      aria-label={`Delete game vs. ${game.opponent}`}
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Score</span>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-bold text-xl tabular-nums text-foreground">
                        {game.teamScore ?? "–"}<span className="text-muted-foreground mx-1">-</span>{game.opponentScore ?? "–"}
                      </span>
                      {resultBadge(game)}
                    </div>
                  </div>
                  {game.notes && (
                    <p className="text-sm text-foreground line-clamp-2">{game.notes}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {isCreateOpen && <GameModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />}

      <ConfirmDialog
        open={!!gameToDelete}
        onOpenChange={(open) => !open && setGameToDelete(null)}
        title="Delete game?"
        description={`This will permanently delete the game vs. "${gameToDelete?.opponent}" and its box score. This can't be undone.`}
        onConfirm={confirmDeleteGame}
      />
    </div>
  );
}
