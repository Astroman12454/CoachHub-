import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import type { Player } from "@shared/schema";

interface BulkAddPlayersDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedLine {
  name: string;
  jerseyNumber: number | null;
}

// A trailing ", 7" (or " 7", "#7") is read as a jersey number if the last
// comma/hash-separated token is a plain integer; anything else in that
// position (a second name, a nickname) is left alone as part of the name
// rather than silently dropped, since a wrong guess here is worse than no
// guess — the coach can always add the number later from the player's
// profile.
function parseLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(.*?)[,#]\s*(\d{1,2})$/);
  if (match && match[1].trim()) {
    return { name: match[1].trim(), jerseyNumber: Number(match[2]) };
  }
  return { name: trimmed, jerseyNumber: null };
}

// Quick roster entry: paste or type a whole team, one player per line,
// instead of opening PlayerForm's full multi-field dialog N times. Anything
// beyond name + jersey number (position, birth date, medical notes...) is
// still reachable afterward from each player's own profile — this only
// exists to get a first roster in fast.
export default function BulkAddPlayersDialog({ isOpen, onClose }: BulkAddPlayersDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const restoreFocus = useDialogFocusReturn(isOpen);

  const parsed = useMemo(
    () => text.split("\n").map(parseLine).filter((p): p is ParsedLine => p !== null),
    [text],
  );

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      restoreFocus();
      setText("");
    }
    onClose();
  };

  const bulkAddMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/players/bulk", {
        players: parsed.map((p) => ({ name: p.name, jerseyNumber: p.jerseyNumber })),
      });
      return res.json() as Promise<Player[]>;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: t("bulkAddPlayers.addedSuccessfully", { count: created.length }) });
      setText("");
      onClose();
    },
    onError: (error) => {
      toast({
        title: t("bulkAddPlayers.failedToAdd"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">
            {t("bulkAddPlayers.title")}
          </DialogTitle>
          <DialogDescription>{t("bulkAddPlayers.description")}</DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("bulkAddPlayers.placeholder")}
          rows={10}
          className="font-mono text-sm"
          autoFocus
        />

        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("bulkAddPlayers.playerCount", { count: parsed.length })}
        </p>

        <div className="flex items-center justify-end space-x-4 pt-2 border-t border-border">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="basketball-orange basketball-orange-hover text-white"
            disabled={parsed.length === 0 || bulkAddMutation.isPending}
            onClick={() => bulkAddMutation.mutate()}
          >
            {bulkAddMutation.isPending
              ? t("bulkAddPlayers.adding")
              : t("bulkAddPlayers.addCount", { count: parsed.length })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
