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
import { computeEvaluationScore } from "@shared/evaluationScore";
import type { Player, EvaluationTest, RecordEvaluationTestResultsResponse } from "@shared/schema";

interface RecordEvaluationResultsDialogProps {
  test: EvaluationTest | null;
  onOpenChange: (open: boolean) => void;
}

function todayIsoDate(): string {
  return new Date().toISOString().split("T")[0];
}

// One team-wide "test day" recorded in a single submit — every active
// player gets a row, prefilled with their most recent result, plus a live
// 1-100 score preview next to each input (see computeEvaluationScore).
export default function RecordEvaluationResultsDialog({ test, onOpenChange }: RecordEvaluationResultsDialogProps) {
  const { t, i18n } = useTranslation();
  const open = !!test;
  const restoreFocus = useDialogFocusReturn(open);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayIsoDate());
  const [values, setValues] = useState<Record<number, string>>({});

  const { data: players = [] } = useQuery<Player[]>({ queryKey: ["/api/players"] });
  const activePlayers = players.filter((p) => p.isActive === 1);

  const { data: latest = {} } = useQuery<Record<number, { value: number; date: string }>>({
    queryKey: [`/api/evaluation-tests/${test?.id}/latest`],
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
      const res = await apiRequest("POST", `/api/evaluation-tests/${test!.id}/results`, { date, results });
      return (await res.json()) as RecordEvaluationTestResultsResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/evaluation-tests/${test?.id}/latest`] });
      if (data.newRecordPlayerIds.length > 0) {
        const names = activePlayers
          .filter((p) => data.newRecordPlayerIds.includes(p.id))
          .map((p) => p.name);
        const formattedNames = new Intl.ListFormat(i18n.language, { style: "long", type: "conjunction" }).format(names);
        toast({
          title: t("recordEvaluationResultsDialog.newRecordTitle"),
          description: t("recordEvaluationResultsDialog.newRecordDescription", { names: formattedNames, count: names.length }),
        });
      } else {
        toast({ title: t("recordEvaluationResultsDialog.savedTitle"), description: t("recordEvaluationResultsDialog.savedDescription") });
      }
      handleOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: t("recordEvaluationResultsDialog.couldntSave"),
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
            {t("recordEvaluationResultsDialog.title", { name: test?.name })}
          </DialogTitle>
          <DialogDescription>{t("recordEvaluationResultsDialog.description", { unit: test?.unit })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="evaluation-test-date">{t("recordEvaluationResultsDialog.date")}</Label>
            <Input id="evaluation-test-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
          </div>

          {activePlayers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("recordEvaluationResultsDialog.noActivePlayers")}</p>
          ) : (
            <div className="space-y-2">
              {activePlayers.map((player) => {
                const raw = values[player.id];
                const parsed = raw ? parseFloat(raw) : NaN;
                const score = test && !isNaN(parsed) ? computeEvaluationScore(parsed, test.worstValue, test.bestValue) : null;
                return (
                  <div key={player.id} className="flex items-center justify-between gap-3">
                    <Label htmlFor={`evaluation-result-${player.id}`} className="flex-1 truncate font-normal">
                      {player.name}
                    </Label>
                    {score !== null && (
                      <span className="text-xs font-semibold text-basketball-orange tabular-nums w-10 text-right shrink-0">{score}</span>
                    )}
                    <Input
                      id={`evaluation-result-${player.id}`}
                      type="number"
                      step="any"
                      inputMode="decimal"
                      placeholder={latest[player.id] ? String(latest[player.id].value) : "—"}
                      value={values[player.id] ?? ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [player.id]: e.target.value }))}
                      className="w-28"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {t("recordEvaluationResultsDialog.filledCount", { count: filledCount, total: activePlayers.length })}
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
              {recordMutation.isPending ? t("common.saving") : t("recordEvaluationResultsDialog.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
