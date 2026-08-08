import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shuffle, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { balanceTeams, computeOverallScore, type BalancerPlayer } from "@/lib/scrimmageBalancer";
import type { Player } from "@shared/schema";

interface ScrimmageBalancerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: Player[];
}

interface TeamAssignment {
  playerId: number;
  name: string;
  score: number;
  hasRatings: boolean;
}

const TEAM_COUNT_OPTIONS = [2, 3, 4];

// Splits the active roster into evenly matched scrimmage teams using each
// player's current skill ratings — a quick "who scrimmages with whom today"
// tool, not a persisted roster. Nothing here is saved; closing the dialog
// discards the split.
export default function ScrimmageBalancerDialog({ open, onOpenChange, players }: ScrimmageBalancerDialogProps) {
  const { t } = useTranslation();
  const restoreFocus = useDialogFocusReturn(open);
  const [numTeams, setNumTeams] = useState(2);
  const [includedIds, setIncludedIds] = useState<Set<number>>(new Set());
  const [teams, setTeams] = useState<TeamAssignment[][] | null>(null);

  const { data: ratings = {} } = useQuery<Record<number, Record<string, number>>>({
    queryKey: ["/api/players/skill-ratings"],
    enabled: open,
  });

  const activePlayers = useMemo(() => players.filter((p) => p.isActive === 1), [players]);

  // Reset to "every active player included, no split generated yet"
  // whenever the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setIncludedIds(new Set(activePlayers.map((p) => p.id)));
      setTeams(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    if (!next) restoreFocus();
    onOpenChange(next);
  };

  const toggleIncluded = (playerId: number) => {
    setIncludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
    setTeams(null);
  };

  const generate = (randomizeTies: boolean) => {
    const roster: BalancerPlayer[] = activePlayers
      .filter((p) => includedIds.has(p.id))
      .map((p) => ({ id: p.id, name: p.name }));
    const balanced = balanceTeams(roster, ratings, numTeams, { randomizeTies });
    setTeams(
      balanced.map((team) =>
        team.players.map((p) => ({
          playerId: p.id,
          name: p.name,
          score: computeOverallScore(ratings[p.id]),
          hasRatings: p.id in ratings,
        }))
      )
    );
  };

  const movePlayer = (playerId: number, fromTeam: number, toTeam: number) => {
    if (!teams || fromTeam === toTeam) return;
    setTeams((prev) => {
      if (!prev) return prev;
      const next = prev.map((team) => [...team]);
      const idx = next[fromTeam].findIndex((p) => p.playerId === playerId);
      if (idx === -1) return prev;
      const [moved] = next[fromTeam].splice(idx, 1);
      next[toTeam].push(moved);
      return next;
    });
  };

  const includedCount = includedIds.size;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight flex items-center gap-2">
            <Shuffle className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            {t("scrimmageBalancer.title")}
          </DialogTitle>
          <DialogDescription>{t("scrimmageBalancer.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <label htmlFor="scrimmage-team-count" className="text-sm font-medium shrink-0">
              {t("scrimmageBalancer.numberOfTeams")}
            </label>
            <Select value={String(numTeams)} onValueChange={(v) => { setNumTeams(Number(v)); setTeams(null); }}>
              <SelectTrigger id="scrimmage-team-count" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEAM_COUNT_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">
              {t("scrimmageBalancer.includePlayers", { count: includedCount })}
            </p>
            {activePlayers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("scrimmageBalancer.noActivePlayers")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {activePlayers.map((player) => {
                  const isIncluded = includedIds.has(player.id);
                  return (
                    <Button
                      key={player.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-pressed={isIncluded}
                      onClick={() => toggleIncluded(player.id)}
                      className={isIncluded ? "bg-basketball-orange/10 border-basketball-orange text-basketball-orange" : "text-muted-foreground"}
                    >
                      {player.name}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => generate(false)}
              disabled={includedCount < numTeams}
              className="basketball-orange basketball-orange-hover text-white"
            >
              <Users className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
              {t("scrimmageBalancer.generate")}
            </Button>
            {teams && (
              <Button type="button" variant="outline" onClick={() => generate(true)}>
                <Shuffle className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
                {t("scrimmageBalancer.shuffleAgain")}
              </Button>
            )}
          </div>

          {includedCount > 0 && includedCount < numTeams && (
            <p className="text-sm text-destructive">{t("scrimmageBalancer.notEnoughPlayers")}</p>
          )}

          {teams && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {teams.map((team, teamIndex) => {
                const avg = team.length > 0 ? team.reduce((sum, p) => sum + p.score, 0) / team.length : 0;
                return (
                  <div key={teamIndex} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-display font-semibold uppercase tracking-tight text-sm">
                        {t("scrimmageBalancer.teamLabel", { number: teamIndex + 1 })}
                      </h3>
                      <Badge variant="secondary">{t("scrimmageBalancer.averageScore", { score: avg.toFixed(1) })}</Badge>
                    </div>
                    <ul className="space-y-1.5">
                      {team.map((p) => (
                        <li key={p.playerId} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate">
                            {p.name}
                            {!p.hasRatings && (
                              <span className="text-muted-foreground"> {t("scrimmageBalancer.unrated")}</span>
                            )}
                          </span>
                          <Select
                            value={String(teamIndex)}
                            onValueChange={(v) => movePlayer(p.playerId, teamIndex, Number(v))}
                          >
                            <SelectTrigger className="w-24 h-7 text-xs" aria-label={t("scrimmageBalancer.moveTo", { name: p.name })}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {teams.map((_, i) => (
                                <SelectItem key={i} value={String(i)}>
                                  {t("scrimmageBalancer.teamLabel", { number: i + 1 })}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
