import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { SKILL_CATEGORIES, type SkillRatingInput } from "@shared/schema";

interface RatePlayerDialogProps {
  playerId: number | null;
  playerName?: string;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_RATINGS: SkillRatingInput = {
  shooting: 5, dribbling: 5, defense: 5, passing: 5, conditioning: 5,
};

export default function RatePlayerDialog({ playerId, playerName, onOpenChange }: RatePlayerDialogProps) {
  const { t } = useTranslation();
  const open = playerId !== null;
  const restoreFocus = useDialogFocusReturn(open);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [ratings, setRatings] = useState<SkillRatingInput>(DEFAULT_RATINGS);

  useEffect(() => {
    if (open) setRatings(DEFAULT_RATINGS);
  }, [open, playerId]);

  const rateMutation = useMutation({
    mutationFn: async () => {
      if (playerId === null) return;
      return apiRequest("POST", `/api/players/${playerId}/skill-ratings`, ratings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/development`] });
      toast({ title: t("ratePlayerDialog.ratingSaved"), description: t("ratePlayerDialog.ratingSavedDescription") });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({ title: t("ratePlayerDialog.couldntSaveRating"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    },
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) restoreFocus();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">{t("ratePlayerDialog.rateTitle", { name: playerName ?? t("ratePlayerDialog.player") })}</DialogTitle>
          <DialogDescription>
            {t("ratePlayerDialog.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {SKILL_CATEGORIES.map((category) => (
            <div key={category}>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor={`rating-${category}`}>{t(`categories.exercise.${category}`, category)}</Label>
                <span className="font-display font-bold tabular-nums text-basketball-orange">{ratings[category]}</span>
              </div>
              <input
                id={`rating-${category}`}
                type="range"
                min={1}
                max={10}
                step={1}
                value={ratings[category]}
                onChange={(e) => setRatings((r) => ({ ...r, [category]: parseInt(e.target.value, 10) }))}
                className="w-full"
                style={{ accentColor: "var(--basketball-orange)" }}
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="basketball-orange basketball-orange-hover text-white"
            onClick={() => rateMutation.mutate()}
            disabled={rateMutation.isPending}
          >
            {rateMutation.isPending ? t("ratePlayerDialog.savingEllipsis") : t("ratePlayerDialog.saveRating")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
