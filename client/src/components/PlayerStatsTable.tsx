import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Player, PlayerGameStatsSummary } from "@shared/schema";

const SORT_FIELDS = ["points", "rebounds", "assists", "steals", "blocks"] as const;
type SortField = (typeof SORT_FIELDS)[number];
const SORT_LABELS: Record<SortField, string> = {
  points: "Points", rebounds: "Rebounds", assists: "Assists", steals: "Steals", blocks: "Blocks",
};

const AVG_COLUMNS = ["points", "rebounds", "assists", "steals", "blocks", "turnovers", "fouls"] as const;
const AVG_LABELS: Record<(typeof AVG_COLUMNS)[number], string> = {
  points: "PPG", rebounds: "RPG", assists: "APG", steals: "SPG", blocks: "BPG", turnovers: "TOPG", fouls: "PF/G",
};
// Points/rebounds/assists are what a coach glances at first, so those stay
// visible on a phone; the rest reappear once there's room (≥640px) instead
// of forcing a horizontal-scrolling table with no visual hint that it
// scrolls — a real dead end on a touch screen.
const MOBILE_HIDDEN_COLUMNS = new Set<(typeof AVG_COLUMNS)[number]>(["steals", "blocks", "turnovers", "fouls"]);

function average(total: number, gamesPlayed: number): string {
  return gamesPlayed > 0 ? (total / gamesPlayed).toFixed(1) : "0.0";
}

export default function PlayerStatsTable() {
  const [sortBy, setSortBy] = useState<SortField>("points");

  const { data: summary = [], isLoading: isLoadingSummary } = useQuery<PlayerGameStatsSummary[]>({
    queryKey: ["/api/players/stats"],
  });
  const { data: roster = [], isLoading: isLoadingRoster } = useQuery<Player[]>({
    queryKey: ["/api/players"],
  });

  const rows = useMemo(() => {
    const byId = new Map(roster.map((p) => [p.id, p]));
    return summary
      .map((s) => ({ ...s, player: byId.get(s.playerId) }))
      .filter((s): s is PlayerGameStatsSummary & { player: Player } => !!s.player)
      .sort((a, b) => b[sortBy] - a[sortBy]);
  }, [summary, roster, sortBy]);

  if (isLoadingSummary || isLoadingRoster) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No Player Stats Yet"
        description="Add stats when logging a game — by hand or from a photo — to see season averages and a leaderboard here."
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
          <SelectTrigger className="w-44" aria-label="Sort by">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {SORT_FIELDS.map((f) => (
              <SelectItem key={f} value={f}>Sort by {SORT_LABELS[f]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Player</th>
              <th className="px-2 py-2 font-medium text-center">GP</th>
              {AVG_COLUMNS.map((c) => (
                <th
                  key={c}
                  className={cn("px-2 py-2 font-medium text-center", MOBILE_HIDDEN_COLUMNS.has(c) && "hidden sm:table-cell")}
                >
                  {AVG_LABELS[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.playerId} className="border-b border-border last:border-0">
                <td className="px-2 py-2.5 text-muted-foreground tabular-nums">{i + 1}</td>
                <td className="px-2 py-2.5 font-medium text-foreground">
                  {row.player.name}
                  {row.player.position && (
                    <span className="hidden sm:inline text-muted-foreground font-normal"> · {row.player.position}</span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-center tabular-nums">{row.gamesPlayed}</td>
                {AVG_COLUMNS.map((c) => (
                  <td
                    key={c}
                    className={cn("px-2 py-2.5 text-center tabular-nums", MOBILE_HIDDEN_COLUMNS.has(c) && "hidden sm:table-cell")}
                  >
                    {average(row[c], row.gamesPlayed)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
