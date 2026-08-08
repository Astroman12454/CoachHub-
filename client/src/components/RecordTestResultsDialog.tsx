import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import type { Player, PhysicalTest } from "@shared/schema";

interface RecordTestResultsDialogProps {
  test: PhysicalTest | null;
  onOpenChange: (open: boolean) => void;
}

function todayIsoDate(): string {
  return new Date().toISOString().split("T")[0];
}

// One team-wide "test day" recorded in a single submit — every active
// player gets a row, prefilled with their most recent result so re-testing
// the roster doesn't start from a blank table.
export default function RecordTestResultsDialog({ test, onOpenChange }: RecordTestResultsDialogProps) {
  const { t } = useTranslation();
  const open = !!test;
  const restoreFocus = useDialogFocusReturn(open);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayIsoDate());
  const [values, setValues] = useState<Record<number, string>>({});

  const { data: players = [] } = useQuery<Player[]>({ queryKey: ["/api/players"] });
  const activePlayers = players.filter((p) => p.isActive === 1);

  const { data: latest = {} } = useQuery<Record<number, { value: number; date: string }>>({
    queryKey: [`/api/physical-tests/${test?.id}/latest`],
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setDate(todayIsoDate());
      setValues({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, test?.id]);

  const handleOpenChange = (next: boolean) => {
    if (!next) restoreFocus();
    onOpenChange(next);
  };

  const recordMutation = useMutation({
    mutationFn: async () => {
      const results = activePlayers
        .map((p) => ({ playerId: p.id, value: parseFloat(values[p.id] ?? "") }))
        .filter((r) => !isNaN(r.value));
      return apiRequest("POST", `/api/physical-tests/${test!.id}/results`, { date, results });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/physical-tests/${test?.id}/latest`] });
      toast({ title: t("recordTestResultsDialog.savedTitle"), description: t("recordTestResultsDialog.savedDescription") });
      handleOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: t("recordTestResultsDialog.couldntSave"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const filledCount = activePlayers.filter((p) => values[p.id]?.trim()).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">
            {t("recordTestResultsDialog.title", { name: test?.name })}
          </DialogTitle>
          <DialogDescription>{t("recordTestResultsDialog.description", { unit: test?.unit })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="test-date">{t("recordTestResultsDialog.date")}</Label>
            <Input id="test-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
          </div>

          {activePlayers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("recordTestResultsDialog.noActivePlayers")}</p>
          ) : (
            <div className="space-y-2">
              {activePlayers.map((player) => (
                <div key={player.id} className="flex items-center justify-between gap-3">
                  <Label htmlFor={`result-${player.id}`} className="flex-1 truncate font-normal">
                    {player.name}
                  </Label>
                  <Input
                    id={`result-${player.id}`}
                    type="number"
                    step="any"
                    inputMode="decimal"
                    placeholder={latest[player.id] ? String(latest[player.id].value) : "—"}
                    value={values[player.id] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [player.id]: e.target.value }))}
                    className="w-28"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {t("recordTestResultsDialog.filledCount", { count: filledCount, total: activePlayers.length })}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              className="basketball-orange basketball-orange-hover text-white"
              disabled={recordMutation.isPending || filledCount === 0}
              onClick={() => recordMutation.mutate()}
            >
              {recordMutation.isPending ? t("common.saving") : t("recordTestResultsDialog.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
