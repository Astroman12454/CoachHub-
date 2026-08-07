import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ShotChart from "@/components/ShotChart";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Player, DrillAttempt } from "@shared/schema";

interface DrillTrackerPanelProps {
  players: Player[];
  date: string;
}

// One tap = one insert (see drillAttempts in the schema), so a misclick is
// undone by deleting that exact row rather than nudging a counter — no
// separate "last action" state to track, the fetched list already carries
// enough to find it.
export default function DrillTrackerPanel({ players, date }: DrillTrackerPanelProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [drillName, setDrillName] = useState("");
  const [view, setView] = useState<"list" | "chart">("list");
  const [shotResult, setShotResult] = useState<0 | 1>(1);
  const trimmedDrillName = drillName.trim();
  const activePlayers = useMemo(() => players.filter((p) => p.isActive === 1), [players]);
  const [chartPlayerId, setChartPlayerId] = useState<number | null>(null);

  useEffect(() => {
    if (chartPlayerId === null && activePlayers.length > 0) setChartPlayerId(activePlayers[0].id);
  }, [activePlayers, chartPlayerId]);

  const { data: attempts = [] } = useQuery<DrillAttempt[]>({
    queryKey: ["/api/players/drill-attempts"],
  });

  const recentDrillNames = useMemo(() => {
    const lastSeenId = new Map<string, number>();
    for (const attempt of attempts) {
      const current = lastSeenId.get(attempt.drillName);
      if (current === undefined || attempt.id > current) lastSeenId.set(attempt.drillName, attempt.id);
    }
    return Array.from(lastSeenId.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .slice(0, 6);
  }, [attempts]);

  const logMutation = useMutation({
    mutationFn: async ({ playerId, made, x, y }: { playerId: number; made: 0 | 1; x?: number; y?: number }) =>
      apiRequest("POST", `/api/players/${playerId}/drill-attempts`, { drillName: trimmedDrillName, date, made, x, y }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players/drill-attempts"] });
    },
    onError: (error) => {
      toast({ title: t("drillTracker.couldntLogAttempt"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    },
  });

  const undoMutation = useMutation({
    mutationFn: async ({ playerId, attemptId }: { playerId: number; attemptId: number }) =>
      apiRequest("DELETE", `/api/players/${playerId}/drill-attempts/${attemptId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players/drill-attempts"] });
    },
    onError: (error) => {
      toast({ title: t("drillTracker.couldntUndo"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    },
  });

  const chartPlayer = activePlayers.find((p) => p.id === chartPlayerId) ?? null;
  // The chart shows every located shot this player has ever logged for this
  // drill (not just today's) — the point of a shot chart is the season-long
  // pattern, not a single session's tally.
  const chartShots = useMemo(
    () =>
      attempts
        .filter((a) => a.playerId === chartPlayerId && a.drillName === trimmedDrillName && a.x !== null && a.y !== null)
        .map((a) => ({ id: a.id, x: a.x as number, y: a.y as number, made: a.made })),
    [attempts, chartPlayerId, trimmedDrillName],
  );
  const lastChartShot = useMemo(
    () =>
      attempts
        .filter((a) => a.playerId === chartPlayerId && a.drillName === trimmedDrillName && a.x !== null && a.y !== null)
        .sort((a, b) => b.id - a.id)[0],
    [attempts, chartPlayerId, trimmedDrillName],
  );

  return (
    <div className="space-y-4 mt-6">
      <div>
        <label htmlFor="drill-tracker-name" className="text-sm font-medium mb-1.5 block">
          {t("drillTracker.drillName")}
        </label>
        <Input
          id="drill-tracker-name"
          value={drillName}
          onChange={(e) => setDrillName(e.target.value)}
          placeholder={t("drillTracker.drillNamePlaceholder")}
        />
        {recentDrillNames.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {recentDrillNames.map((name) => (
              <Button
                key={name}
                type="button"
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => setDrillName(name)}
              >
                {name}
              </Button>
            ))}
          </div>
        )}
      </div>

      {!trimmedDrillName ? (
        <p className="text-sm text-muted-foreground text-center py-6">{t("drillTracker.pickADrill")}</p>
      ) : (
        <>
          <div className="flex gap-1 border-b border-border">
            {(["list", "chart"] as const).map((viewKey) => (
              <button
                key={viewKey}
                type="button"
                onClick={() => setView(viewKey)}
                className={cn(
                  "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  view === viewKey
                    ? "border-basketball-orange text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {viewKey === "list" ? t("drillTracker.listView") : t("drillTracker.chartView")}
              </button>
            ))}
          </div>

          {view === "list" ? (
            <div className="space-y-2">
              {activePlayers.map((player) => {
                const playerAttempts = attempts
                  .filter((a) => a.playerId === player.id && a.drillName === trimmedDrillName && a.date === date)
                  .sort((a, b) => b.id - a.id);
                const madeCount = playerAttempts.filter((a) => a.made === 1).length;
                const totalCount = playerAttempts.length;
                const pct = totalCount > 0 ? Math.round((madeCount / totalCount) * 100) : 0;
                const lastAttempt = playerAttempts[0];
                const isLogPending = logMutation.isPending && logMutation.variables?.playerId === player.id;
                const isUndoPending = undoMutation.isPending && undoMutation.variables?.playerId === player.id;

                return (
                  <Card key={player.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate">{player.name}</div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {totalCount > 0
                              ? t("drillTracker.tally", { made: madeCount, total: totalCount, pct })
                              : t("drillTracker.noAttemptsYet")}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-success text-success hover:bg-success-tint"
                            disabled={isLogPending}
                            onClick={() => logMutation.mutate({ playerId: player.id, made: 1 })}
                            aria-label={t("drillTracker.logMadeFor", { name: player.name })}
                          >
                            <Check className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-red-500 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                            disabled={isLogPending}
                            onClick={() => logMutation.mutate({ playerId: player.id, made: 0 })}
                            aria-label={t("drillTracker.logMissedFor", { name: player.name })}
                          >
                            <X className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="text-muted-foreground"
                            disabled={!lastAttempt || isUndoPending}
                            onClick={() => lastAttempt && undoMutation.mutate({ playerId: player.id, attemptId: lastAttempt.id })}
                            aria-label={t("drillTracker.undoLastFor", { name: player.name })}
                            title={t("drillTracker.undo")}
                          >
                            <Undo2 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <Select
                  value={chartPlayerId !== null ? String(chartPlayerId) : undefined}
                  onValueChange={(v) => setChartPlayerId(Number(v))}
                >
                  <SelectTrigger className="flex-1" aria-label={t("drillTracker.selectPlayer")}>
                    <SelectValue placeholder={t("drillTracker.selectPlayer")} />
                  </SelectTrigger>
                  <SelectContent>
                    {activePlayers.map((player) => (
                      <SelectItem key={player.id} value={String(player.id)}>
                        {player.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={shotResult === 1 ? "bg-success-tint border-success text-success" : ""}
                    onClick={() => setShotResult(1)}
                    aria-pressed={shotResult === 1}
                  >
                    <Check className="w-4 h-4 mr-1" strokeWidth={2} aria-hidden="true" />
                    {t("drillTracker.made")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={shotResult === 0 ? "bg-red-100 border-red-500 text-red-700 dark:bg-red-950/40 dark:text-red-300" : ""}
                    onClick={() => setShotResult(0)}
                    aria-pressed={shotResult === 0}
                  >
                    <X className="w-4 h-4 mr-1" strokeWidth={2} aria-hidden="true" />
                    {t("drillTracker.missed")}
                  </Button>
                </div>
              </div>

              {chartPlayer && (
                <>
                  <p className="text-xs text-muted-foreground">{t("drillTracker.tapCourtHint")}</p>
                  <ShotChart
                    shots={chartShots}
                    ariaLabel={t("drillTracker.shotChartFor", { name: chartPlayer.name })}
                    onCourtClick={(x, y) => logMutation.mutate({ playerId: chartPlayer.id, made: shotResult, x, y })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!lastChartShot || undoMutation.isPending}
                    onClick={() => lastChartShot && undoMutation.mutate({ playerId: chartPlayer.id, attemptId: lastChartShot.id })}
                  >
                    <Undo2 className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
                    {t("drillTracker.undo")}
                  </Button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
