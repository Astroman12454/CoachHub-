import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Users, CheckCircle2, Target, PieChart, Link2, HeartPulse, Shuffle, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import TopBar from "@/components/TopBar";
import PlayerForm from "@/components/PlayerForm";
import PlayerPortalDialog from "@/components/PlayerPortalDialog";
import ScrimmageBalancerDialog from "@/components/ScrimmageBalancerDialog";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { calculateAge } from "@/lib/time";
import type { Player, PlayerInjury } from "@shared/schema";

export default function Players() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [filterActive, setFilterActive] = useState<string>("all");
  const [portalPlayer, setPortalPlayer] = useState<Player | null>(null);
  const [isBalancerOpen, setIsBalancerOpen] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: players = [], isLoading, isError, refetch } = useQuery<Player[]>({
    queryKey: ['/api/players'],
  });

  const { data: activeInjuries = [] } = useQuery<PlayerInjury[]>({
    queryKey: ['/api/players/injuries'],
  });
  const injuredPlayerIds = useMemo(
    () => new Set(activeInjuries.map((injury) => injury.playerId)),
    [activeInjuries]
  );

  const updatePlayerMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: number }) => {
      return apiRequest("PUT", `/api/players/${id}`, { isActive });
    },
    // Flips the badge/button right away instead of waiting on the server,
    // since the toggle is the only feedback the coach needs here.
    onMutate: async ({ id, isActive }) => {
      const queryKey = ['/api/players'];
      await queryClient.cancelQueries({ queryKey });
      const previousPlayers = queryClient.getQueryData<Player[]>(queryKey);

      queryClient.setQueryData<Player[]>(queryKey, (old = []) =>
        old.map(player => player.id === id ? { ...player, isActive } : player)
      );

      return { previousPlayers, queryKey };
    },
    onError: (_err, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.queryKey, context.previousPlayers);
      }
      toast({
        title: t("players.error"),
        description: t("players.failedToUpdate"),
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    },
  });

  const togglePlayerStatus = (player: Player) => {
    const newStatus = player.isActive === 1 ? 0 : 1;
    updatePlayerMutation.mutate({ id: player.id, isActive: newStatus });
  };

  // Filter players
  const filteredPlayers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return players.filter(player => {
      const matchesSearch = player.name.toLowerCase().includes(query) ||
                           (player.position && player.position.toLowerCase().includes(query));
      const matchesStatus = filterActive === "all" ||
                           (filterActive === "active" && player.isActive === 1) ||
                           (filterActive === "inactive" && player.isActive === 0);

      return matchesSearch && matchesStatus;
    });
  }, [players, searchQuery, filterActive]);

  // Group players by position
  const playersByPosition = useMemo(() => {
    return filteredPlayers.reduce((acc, player) => {
      const position = player.position || t("players.noPosition");
      if (!acc[position]) acc[position] = [];
      acc[position].push(player);
      return acc;
    }, {} as Record<string, Player[]>);
  }, [filteredPlayers]);

  const activeRate = players.length > 0
    ? Math.round((players.filter(p => p.isActive === 1).length / players.length) * 100)
    : 0;

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar
          title={t("nav.players")}
          subtitle={t("players.subtitle")}
          onSearch={setSearchQuery}
          searchPlaceholder={t("players.searchPlaceholder")}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col h-full">
        <TopBar
          title={t("nav.players")}
          subtitle={t("players.subtitle")}
          onSearch={setSearchQuery}
          searchPlaceholder={t("players.searchPlaceholder")}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorState onRetry={() => refetch()} />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title={t("nav.players")}
        subtitle={t("players.subtitle")}
        onSearch={setSearchQuery}
        searchPlaceholder={t("players.searchPlaceholder")}
      />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        {/* Filters and Add Button */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center">
            <Select value={filterActive} onValueChange={setFilterActive}>
              <SelectTrigger className="w-full sm:w-48" aria-label={t("players.filterByStatus")}>
                <SelectValue placeholder={t("players.filterByStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("players.allPlayers")}</SelectItem>
                <SelectItem value="active">{t("players.activePlayers")}</SelectItem>
                <SelectItem value="inactive">{t("players.inactivePlayers")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row w-full sm:w-auto">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setIsBalancerOpen(true)}
            >
              <Shuffle className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
              {t("scrimmageBalancer.openButton")}
            </Button>
            <Button
              className="basketball-orange basketball-orange-hover text-white w-full sm:w-auto"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <UserPlus className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
              {t("dashboard.addPlayer")}
            </Button>
          </div>
        </div>

        {/* Player Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            label={t("players.totalPlayers")}
            value={players.length}
            icon={Users}
            color="court"
          />
          <StatCard
            label={t("players.activePlayers")}
            value={players.filter(p => p.isActive === 1).length}
            icon={CheckCircle2}
            color="success"
          />
          <StatCard
            label={t("players.positions")}
            value={Object.keys(playersByPosition).length}
            icon={Target}
            color="violet"
          />
          <StatCard
            label={t("players.activeRate")}
            value={`${activeRate}%`}
            icon={PieChart}
            color="orange"
          />
        </div>

        {/* Players List */}
        {filteredPlayers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t("players.emptyTitle")}
            description={
              searchQuery || filterActive !== "all"
                ? t("players.emptyFilterDescription")
                : t("players.emptyDescription")
            }
            action={!searchQuery && filterActive === "all" ? {
              label: t("players.addFirstPlayer"),
              icon: UserPlus,
              onClick: () => setIsCreateModalOpen(true),
            } : undefined}
          />
        ) : (
          <div className="space-y-6">
            {Object.entries(playersByPosition).map(([position, positionPlayers], groupIndex) => (
              <Card key={position} className="fade-in" style={{ animationDelay: `${Math.min(groupIndex, 6) * 60}ms` }}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{position}</span>
                    <Badge variant="secondary">{t("players.playerCount", { count: positionPlayers.length })}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {positionPlayers.map((player) => (
                      <div
                        key={player.id}
                        className="border border-border rounded-lg p-4 hover:border-basketball-orange hover:shadow-md hover:-translate-y-0.5 transition-all"
                      >
                        {/* Only the summary (name/badge/position) is the
                            clickable region — the action buttons below are
                            siblings, not children, of it, since a button
                            can't validly contain other interactive
                            controls (axe: nested-interactive). */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setLocation(`/players/${player.id}`)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setLocation(`/players/${player.id}`);
                            }
                          }}
                          className="cursor-pointer mb-2 flex items-start gap-3"
                          aria-label={t("players.viewProfile", { name: player.name })}
                        >
                          <div className="w-10 h-10 flex-shrink-0 rounded-full bg-muted flex items-center justify-center font-display font-semibold text-foreground text-sm">
                            {player.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between mb-1 gap-2">
                              <h3 className="font-display font-semibold uppercase tracking-tight text-foreground truncate">{player.name}</h3>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {injuredPlayerIds.has(player.id) && (
                                  <Badge variant="destructive" className="gap-1">
                                    <HeartPulse className="w-3 h-3" strokeWidth={2} aria-hidden="true" />
                                    {t("playerProfile.injured")}
                                  </Badge>
                                )}
                                <Badge
                                  variant={player.isActive === 1 ? "default" : "secondary"}
                                  className={player.isActive === 1 ? "bg-success-tint text-success" : ""}
                                >
                                  {player.isActive === 1 ? t("players.active") : t("players.inactive")}
                                </Badge>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground truncate">
                              {[
                                player.position,
                                player.birthDate ? t("players.ageValue", { count: calculateAge(player.birthDate) ?? 0 }) : null,
                                player.height ? t("players.heightValue", { count: player.height }) : null,
                              ].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setEditingPlayer(player)}
                            className="w-8 h-8"
                            aria-label={t("players.editPlayerFor", { name: player.name })}
                            title={t("common.edit")}
                          >
                            <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setPortalPlayer(player)}
                            className="w-8 h-8"
                            aria-label={t("players.portalLinkFor", { name: player.name })}
                            title={t("players.portalLink")}
                          >
                            <Link2 className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => togglePlayerStatus(player)}
                            disabled={updatePlayerMutation.isPending}
                            className="text-xs"
                          >
                            {player.isActive === 1 ? t("players.deactivate") : t("players.activate")}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {isCreateModalOpen && (
        <PlayerForm
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
        />
      )}

      {editingPlayer && (
        <PlayerForm
          isOpen={!!editingPlayer}
          onClose={() => setEditingPlayer(null)}
          player={editingPlayer}
        />
      )}

      <PlayerPortalDialog player={portalPlayer} onOpenChange={(open) => !open && setPortalPlayer(null)} />

      <ScrimmageBalancerDialog open={isBalancerOpen} onOpenChange={setIsBalancerOpen} players={players} />
    </div>
  );
}
