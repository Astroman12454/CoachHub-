import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { computeEvaluationScore } from "@shared/evaluationScore";
import type { EvaluationTest, RecordEvaluationTestResultsResponse } from "@shared/schema";

interface QuickAddEvaluationResultDialogProps {
  playerId: number | null;
  playerName?: string;
  onOpenChange: (open: boolean) => void;
}

function todayIsoDate(): string {
  return new Date().toISOString().split("T")[0];
}

// Single-player equivalent of RecordEvaluationResultsDialog — one result,
// for one player, from their own profile, instead of a whole-roster batch.
// Reuses the exact same POST /api/evaluation-tests/:id/results endpoint
// with a one-entry results array.
export default function QuickAddEvaluationResultDialog({ playerId, playerName, onOpenChange }: QuickAddEvaluationResultDialogProps) {
  const { t } = useTranslation();
  const open = playerId !== null;
  const restoreFocus = useDialogFocusReturn(open);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [testId, setTestId] = useState<string>("");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayIsoDate());

  const { data: tests = [] } = useQuery<EvaluationTest[]>({ queryKey: ["/api/evaluation-tests"], enabled: open });

  useEffect(() => {
    if (open) {
      setTestId("");
      setValue("");
      setDate(todayIsoDate());
    }
  }, [open, playerId]);

  const handleOpenChange = (next: boolean) => {
    if (!next) restoreFocus();
    onOpenChange(next);
  };

  const selectedTest = tests.find((t) => t.id === Number(testId));
  const parsedValue = parseFloat(value);
  const score = selectedTest && !isNaN(parsedValue) ? computeEvaluationScore(parsedValue, selectedTest.worstValue, selectedTest.bestValue) : null;

  const addResultMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/evaluation-tests/${testId}/results`, {
        date,
        results: [{ playerId, value: parsedValue }],
      });
      return (await res.json()) as RecordEvaluationTestResultsResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/evaluation-results`] });
      queryClient.invalidateQueries({ queryKey: [`/api/evaluation-tests/${testId}/latest`] });
      queryClient.invalidateQueries({ queryKey: ["/api/players/evaluation-scores"] });
      toast({ title: t("quickAddEvaluationResult.savedTitle"), description: t("quickAddEvaluationResult.savedDescription") });
      handleOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: t("quickAddEvaluationResult.couldntSave"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const canSave = testId !== "" && value.trim() !== "" && !isNaN(parsedValue);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">{t("quickAddEvaluationResult.title")}</DialogTitle>
          <DialogDescription>{t("quickAddEvaluationResult.description", { name: playerName ?? "" })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="quick-add-test">{t("quickAddEvaluationResult.test")}</Label>
            <Select value={testId} onValueChange={setTestId}>
              <SelectTrigger id="quick-add-test" className="mt-1">
                <SelectValue placeholder={t("quickAddEvaluationResult.testPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {tests.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tests.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1.5">{t("quickAddEvaluationResult.noTests")}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="quick-add-value">{selectedTest ? t("quickAddEvaluationResult.valueWithUnit", { unit: selectedTest.unit }) : t("quickAddEvaluationResult.value")}</Label>
              <Input
                id="quick-add-value"
                type="number"
                step="any"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="quick-add-date">{t("recordEvaluationResultsDialog.date")}</Label>
              <Input id="quick-add-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            </div>
          </div>

          {score !== null && (
            <p className="text-sm text-muted-foreground">
              {t("quickAddEvaluationResult.scorePreview", { score })}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="basketball-orange basketball-orange-hover text-white"
            disabled={!canSave || addResultMutation.isPending}
            onClick={() => addResultMutation.mutate()}
          >
            {addResultMutation.isPending ? t("common.saving") : t("quickAddEvaluationResult.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
