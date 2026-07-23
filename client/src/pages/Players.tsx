import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import TopBar from "@/components/TopBar";
import PlayerForm from "@/components/PlayerForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Player } from "@shared/schema";

export default function Players() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [filterActive, setFilterActive] = useState<string>("all");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: players = [], isLoading } = useQuery<Player[]>({
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
        description: "Error al actualizar el jugador",
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
      const position = player.position || "Sin Posición";
      if (!acc[position]) acc[position] = [];
      acc[position].push(player);
      return acc;
    }, {} as Record<string, Player[]>);
  }, [filteredPlayers]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar
          title="Jugadores"
          subtitle="Gestiona los jugadores de tu equipo"
          onSearch={setSearchQuery}
          searchPlaceholder="Buscar jugadores..."
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

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Jugadores"
        subtitle="Gestiona los jugadores de tu equipo"
        onSearch={setSearchQuery}
        searchPlaceholder="Buscar jugadores..."
      />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        {/* Filters and Add Button */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center">
            <Select value={filterActive} onValueChange={setFilterActive}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los Jugadores</SelectItem>
                <SelectItem value="active">Jugadores Activos</SelectItem>
                <SelectItem value="inactive">Jugadores Inactivos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            className="basketball-orange basketball-orange-hover text-white w-full sm:w-auto"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <i className="fas fa-user-plus mr-2"></i>
            Añadir Jugador
          </Button>
        </div>

        {/* Player Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Jugadores</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{players.length}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/40 rounded-lg flex items-center justify-center">
                  <i className="fas fa-users text-blue-600 text-xl"></i>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Jugadores Activos</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                    {players.filter(p => p.isActive === 1).length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-100 dark:bg-green-950/40 rounded-lg flex items-center justify-center">
                  <i className="fas fa-check-circle text-green-600 text-xl"></i>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Posiciones</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                    {Object.keys(playersByPosition).length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-950/40 rounded-lg flex items-center justify-center">
                  <i className="fas fa-basketball-ball text-purple-600 text-xl"></i>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Tasa de Actividad</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                    {Math.round((players.filter(p => p.isActive === 1).length / players.length) * 100)}%
                  </p>
                </div>
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-950/40 rounded-lg flex items-center justify-center">
                  <i className="fas fa-chart-pie text-orange-600 text-xl"></i>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Players List */}
        {filteredPlayers.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <div className="w-24 h-24 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-users text-gray-400 dark:text-gray-500 text-3xl"></i>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">No se encontraron jugadores</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {searchQuery || filterActive !== "all"
                  ? "No hay jugadores que coincidan con los filtros actuales."
                  : "Comienza añadiendo tu primer jugador al equipo."
                }
              </p>
              {!searchQuery && filterActive === "all" && (
                <Button
                  className="basketball-orange basketball-orange-hover text-white"
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  <i className="fas fa-user-plus mr-2"></i>
                  Añadir Primer Jugador
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(playersByPosition).map(([position, positionPlayers]) => (
              <Card key={position}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{position}</span>
                    <Badge variant="secondary">{positionPlayers.length} jugadores</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {positionPlayers.map((player) => (
                      <div
                        key={player.id}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">{player.name}</h4>
                          <Badge
                            variant={player.isActive === 1 ? "default" : "secondary"}
                            className={player.isActive === 1 ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300" : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"}
                          >
                            {player.isActive === 1 ? "Activo" : "Inactivo"}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-gray-600 dark:text-gray-400">{player.position}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => togglePlayerStatus(player)}
                            disabled={updatePlayerMutation.isPending}
                            className="text-xs"
                          >
                            {player.isActive === 1 ? "Desactivar" : "Activar"}
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
    </div>
  );
}
