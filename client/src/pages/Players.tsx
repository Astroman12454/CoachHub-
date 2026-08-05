import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Users, CheckCircle2, Target, PieChart, Link2 } from "lucide-react";
import TopBar from "@/components/TopBar";
import PlayerForm from "@/components/PlayerForm";
import PlayerPortalDialog from "@/components/PlayerPortalDialog";
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
import type { Player } from "@shared/schema";

export default function Players() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [filterActive, setFilterActive] = useState<string>("all");
  const [portalPlayer, setPortalPlayer] = useState<Player | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: players = [], isLoading, isError, refetch } = useQuery<Player[]>({
    queryKey: ['/api/players'],
  });

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
        title: "Error",
        description: "Failed to update player",
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
      const position = player.position || "No Position";
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
          title="Players"
          subtitle="Manage your team's players"
          onSearch={setSearchQuery}
          searchPlaceholder="Search players..."
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
          title="Players"
          subtitle="Manage your team's players"
          onSearch={setSearchQuery}
          searchPlaceholder="Search players..."
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
        title="Players"
        subtitle="Manage your team's players"
        onSearch={setSearchQuery}
        searchPlaceholder="Search players..."
      />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        {/* Filters and Add Button */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center">
            <Select value={filterActive} onValueChange={setFilterActive}>
              <SelectTrigger className="w-full sm:w-48" aria-label="Filter by status">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Players</SelectItem>
                <SelectItem value="active">Active Players</SelectItem>
                <SelectItem value="inactive">Inactive Players</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            className="basketball-orange basketball-orange-hover text-white w-full sm:w-auto"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <UserPlus className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
            Add Player
          </Button>
        </div>

        {/* Player Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Total Players"
            value={players.length}
            icon={Users}
            color="court"
          />
          <StatCard
            label="Active Players"
            value={players.filter(p => p.isActive === 1).length}
            icon={CheckCircle2}
            color="success"
          />
          <StatCard
            label="Positions"
            value={Object.keys(playersByPosition).length}
            icon={Target}
            color="violet"
          />
          <StatCard
            label="Active Rate"
            value={`${activeRate}%`}
            icon={PieChart}
            color="orange"
          />
        </div>

        {/* Players List */}
        {filteredPlayers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No Players Found"
            description={
              searchQuery || filterActive !== "all"
                ? "No players match your current filters."
                : "Get started by adding your first player to the team."
            }
            action={!searchQuery && filterActive === "all" ? {
              label: "Add First Player",
              icon: UserPlus,
              onClick: () => setIsCreateModalOpen(true),
            } : undefined}
          />
        ) : (
          <div className="space-y-6">
            {Object.entries(playersByPosition).map(([position, positionPlayers]) => (
              <Card key={position}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{position}</span>
                    <Badge variant="secondary">{positionPlayers.length} player{positionPlayers.length !== 1 ? 's' : ''}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {positionPlayers.map((player) => (
                      <div
                        key={player.id}
                        className="border border-border rounded-lg p-4 hover:border-basketball-orange hover:shadow-sm transition-all"
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
                          className="cursor-pointer mb-2"
                          aria-label={`View ${player.name}'s profile`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-display font-semibold uppercase tracking-tight text-foreground">{player.name}</h3>
                            <Badge
                              variant={player.isActive === 1 ? "default" : "secondary"}
                              className={player.isActive === 1 ? "bg-success-tint text-success" : ""}
                            >
                              {player.isActive === 1 ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">{player.position}</p>
                        </div>
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setPortalPlayer(player)}
                            className="w-8 h-8"
                            aria-label={`Portal link for ${player.name}`}
                            title="Portal link"
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
                            {player.isActive === 1 ? "Deactivate" : "Activate"}
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

      <PlayerPortalDialog player={portalPlayer} onOpenChange={(open) => !open && setPortalPlayer(null)} />
    </div>
  );
}
