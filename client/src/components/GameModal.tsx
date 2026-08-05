import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { startCheckout } from "@/lib/billing";
import type { Player } from "@shared/schema";

interface GameModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STAT_FIELDS = ["points", "rebounds", "assists", "steals", "blocks", "turnovers", "fouls"] as const;
type StatField = (typeof STAT_FIELDS)[number];
const STAT_LABELS: Record<StatField, string> = {
  points: "PTS", rebounds: "REB", assists: "AST", steals: "STL", blocks: "BLK", turnovers: "TO", fouls: "PF",
};

interface StatRow {
  key: string;
  playerId: number | null;
  points: number; rebounds: number; assists: number; steals: number; blocks: number; turnovers: number; fouls: number;
}

const emptyRow = (): StatRow => ({
  key: crypto.randomUUID(), playerId: null,
  points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0,
});

interface ExtractedBoxScore {
  opponent: string | null;
  date: string | null;
  teamScore: number | null;
  opponentScore: number | null;
  players: Array<{ name: string; points: number; rebounds: number; assists: number; steals: number; blocks: number; turnovers: number; fouls: number }>;
}

export default function GameModal({ isOpen, onClose }: GameModalProps) {
  const restoreFocus = useDialogFocusReturn(isOpen);
  const { toast } = useToast();
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const canImport = account?.plan === "paid";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: roster = [] } = useQuery<Player[]>({ queryKey: ["/api/players"] });

  const [mode, setMode] = useState<"choose" | "form">("choose");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unmatchedNote, setUnmatchedNote] = useState<string | null>(null);

  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [teamScore, setTeamScore] = useState("");
  const [opponentScore, setOpponentScore] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<StatRow[]>([]);

  const resetAll = () => {
    setMode("choose");
    setOpponent(""); setDate(""); setLocation(""); setTeamScore(""); setOpponentScore("");
    setNotes(""); setRows([]); setUnmatchedNote(null);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      restoreFocus();
      resetAll();
    }
    onClose();
  };

  const handleUploadClick = () => {
    if (!canImport) {
      toast({
        title: "Free plan",
        description: "Upgrade to a paid plan to import box scores from a photo or PDF.",
        action: (
          <ToastAction altText="Upgrade" onClick={() => startCheckout()}>
            Upgrade
          </ToastAction>
        ),
      });
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/games/analyze", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) {
        let message = "Couldn't read that file.";
        try {
          const body = await res.json();
          if (typeof body?.message === "string") message = body.message;
        } catch {
          // response wasn't JSON — fall back to the generic message
        }
        throw new Error(message);
      }

      const extracted: ExtractedBoxScore = await res.json();
      setOpponent(extracted.opponent ?? "");
      setDate(extracted.date ?? "");
      setTeamScore(extracted.teamScore != null ? String(extracted.teamScore) : "");
      setOpponentScore(extracted.opponentScore != null ? String(extracted.opponentScore) : "");

      let unmatchedCount = 0;
      const newRows: StatRow[] = extracted.players.map((line) => {
        const match = roster.find((p) => p.name.trim().toLowerCase() === line.name.trim().toLowerCase());
        if (!match) unmatchedCount++;
        return {
          key: crypto.randomUUID(),
          playerId: match ? match.id : null,
          points: line.points, rebounds: line.rebounds, assists: line.assists,
          steals: line.steals, blocks: line.blocks, turnovers: line.turnovers, fouls: line.fouls,
        };
      });
      setRows(newRows);
      setUnmatchedNote(
        unmatchedCount > 0
          ? `${unmatchedCount} player${unmatchedCount === 1 ? "" : "s"} from the photo couldn't be matched to your roster automatically — pick them from the dropdown below, or remove the row.`
          : null,
      );
      setMode("form");
    } catch (error) {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Couldn't read that file.",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));
  const updateRow = (key: string, patch: Partial<StatRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const usedPlayerIds = new Set(rows.map((r) => r.playerId).filter((id): id is number => id != null));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const stats = rows
        .filter((r) => r.playerId != null)
        .map((r) => ({
          playerId: r.playerId!,
          points: r.points, rebounds: r.rebounds, assists: r.assists,
          steals: r.steals, blocks: r.blocks, turnovers: r.turnovers, fouls: r.fouls,
        }));

      await apiRequest("POST", "/api/games", {
        opponent,
        date,
        location: location || null,
        teamScore: teamScore === "" ? null : parseInt(teamScore, 10),
        opponentScore: opponentScore === "" ? null : parseInt(opponentScore, 10),
        notes: notes || null,
        stats,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      toast({ title: "Success", description: "Game saved." });
      restoreFocus();
      onClose();
      resetAll();
    } catch (error) {
      toast({ title: "Error", description: extractErrorMessage(error) ?? "Failed to save game", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-display uppercase tracking-tight">Log a Game</DialogTitle>
          <DialogDescription className="sr-only">
            Record a game's result and, optionally, each player's stats — either by hand or by uploading a
            photo or PDF of the box score.
          </DialogDescription>
        </DialogHeader>

        {mode === "choose" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <button
              type="button"
              onClick={() => { setRows([]); setMode("form"); }}
              className="border border-border rounded-lg p-6 text-left hover:border-basketball-orange hover:shadow-sm transition-all"
            >
              <h3 className="font-display uppercase tracking-tight text-base text-foreground mb-1">Enter Manually</h3>
              <p className="text-sm text-muted-foreground">Type in the score and any stats you want to track.</p>
            </button>

            <button
              type="button"
              onClick={handleUploadClick}
              disabled={analyzing}
              className="border border-border rounded-lg p-6 text-left hover:border-basketball-orange hover:shadow-sm transition-all relative disabled:opacity-70"
            >
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-display uppercase tracking-tight text-base text-foreground">Import from Photo/PDF</h3>
                {!canImport && <Badge variant="secondary" className="text-xs">Paid</Badge>}
              </div>
              <p className="text-sm text-muted-foreground pr-6">
                {analyzing ? "Reading the box score…" : "Upload a scoresheet or scoreboard photo and we'll fill it in."}
              </p>
              {analyzing && (
                <Loader2 className="w-4 h-4 animate-spin absolute top-4 right-4 text-basketball-orange" aria-hidden="true" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Box score photo or PDF"
            />
          </div>
        )}

        {mode === "form" && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {unmatchedNote && (
              <p className="text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md p-3">
                {unmatchedNote}
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="game-opponent">Opponent</Label>
                <Input id="game-opponent" value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="e.g., Central High" required />
              </div>
              <div>
                <Label htmlFor="game-date">Date</Label>
                <Input id="game-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="game-location">Location</Label>
                <Select value={location || "unset"} onValueChange={(v) => setLocation(v === "unset" ? "" : v)}>
                  <SelectTrigger id="game-location">
                    <SelectValue placeholder="Home or away" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Not set</SelectItem>
                    <SelectItem value="home">Home</SelectItem>
                    <SelectItem value="away">Away</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="game-team-score">Your Score</Label>
                  <Input id="game-team-score" type="number" min="0" inputMode="numeric" value={teamScore} onChange={(e) => setTeamScore(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="game-opp-score">Opponent Score</Label>
                  <Input id="game-opp-score" type="number" min="0" inputMode="numeric" value={opponentScore} onChange={(e) => setOpponentScore(e.target.value)} />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="game-notes">Notes (Optional)</Label>
              <Textarea id="game-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How the team played, standout moments..." />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display uppercase tracking-tight text-base text-foreground">Player Stats (Optional)</h3>
                <Button type="button" variant="outline" size="sm" onClick={addRow}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" strokeWidth={2} aria-hidden="true" />
                  Add Player
                </Button>
              </div>

              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No player stats added yet. Add a player to log points, rebounds, and more.</p>
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="px-1 py-1 font-medium">Player</th>
                        {STAT_FIELDS.map((f) => (
                          <th key={f} className="px-1 py-1 font-medium text-center">{STAT_LABELS[f]}</th>
                        ))}
                        <th className="px-1 py-1"><span className="sr-only">Remove</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.key} className="border-t border-border">
                          <td className="px-1 py-1.5 min-w-[150px]">
                            <Select
                              value={row.playerId?.toString() ?? "unmatched"}
                              onValueChange={(v) => updateRow(row.key, { playerId: v === "unmatched" ? null : parseInt(v, 10) })}
                            >
                              <SelectTrigger aria-label="Player" className="h-8">
                                <SelectValue placeholder="Select player" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unmatched">Unmatched — skip</SelectItem>
                                {roster.map((p) => (
                                  <SelectItem key={p.id} value={p.id.toString()} disabled={usedPlayerIds.has(p.id) && row.playerId !== p.id}>
                                    {p.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          {STAT_FIELDS.map((stat) => (
                            <td key={stat} className="px-1 py-1.5">
                              <Input
                                type="number"
                                min="0"
                                inputMode="numeric"
                                className="h-8 w-14 text-center px-1"
                                value={row[stat]}
                                onChange={(e) => updateRow(row.key, { [stat]: Math.max(0, parseInt(e.target.value, 10) || 0) } as Partial<StatRow>)}
                                aria-label={`${STAT_LABELS[stat]} for ${roster.find((p) => p.id === row.playerId)?.name ?? "player"}`}
                              />
                            </td>
                          ))}
                          <td className="px-1 py-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => removeRow(row.key)}
                              aria-label="Remove player from box score"
                            >
                              <X className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-4 pt-6 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setMode("choose")}>
                Back
              </Button>
              <Button type="submit" className="basketball-orange basketball-orange-hover text-white" disabled={saving || !opponent || !date}>
                {saving ? "Saving..." : "Save Game"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
