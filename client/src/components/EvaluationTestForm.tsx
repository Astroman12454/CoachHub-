import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useSaveMutation } from "@/hooks/use-save-mutation";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { insertEvaluationTestSchema, EVALUATION_TEST_TYPES } from "@shared/schema";
import { computeEvaluationScore } from "@shared/evaluationScore";
import type { EvaluationTest } from "@shared/schema";

type EvaluationTestFormData = z.infer<typeof insertEvaluationTestSchema>;

interface EvaluationTestFormProps {
  isOpen: boolean;
  onClose: () => void;
  test?: EvaluationTest | null;
}

export default function EvaluationTestForm({ isOpen, onClose, test }: EvaluationTestFormProps) {
  const { t } = useTranslation();
  const isEditing = !!test;
  const restoreFocus = useDialogFocusReturn(isOpen);
  const handleOpenChange = (open: boolean) => {
    if (!open) restoreFocus();
    onClose();
  };

  const form = useForm<EvaluationTestFormData>({
    resolver: zodResolver(insertEvaluationTestSchema),
    defaultValues: {
      name: test?.name ?? "",
      type: test?.type ?? "time",
      unit: test?.unit ?? "",
      worstValue: test?.worstValue ?? 0,
      bestValue: test?.bestValue ?? 0,
      description: test?.description ?? "",
    },
  });

  const type = form.watch("type");
  const worstValue = form.watch("worstValue");
  const bestValue = form.watch("bestValue");

  // A quick "try it out" sandbox — lets a coach sanity-check their worst/
  // best reference values by typing a sample result and seeing exactly what
  // score it would produce, instead of having to guess and save blind.
  const [previewValue, setPreviewValue] = useState("");
  const parsedPreview = previewValue.trim() === "" ? NaN : parseFloat(previewValue);
  const previewScore = !isNaN(parsedPreview) && !isNaN(worstValue) && !isNaN(bestValue) && worstValue !== bestValue
    ? computeEvaluationScore(parsedPreview, worstValue, bestValue)
    : null;

  const saveTestMutation = useSaveMutation<EvaluationTestFormData>({
    endpoint: "/api/evaluation-tests",
    id: test?.id,
    successMessage: isEditing ? t("evaluationTestForm.updatedSuccessfully") : t("evaluationTestForm.createdSuccessfully"),
    errorMessage: isEditing ? t("evaluationTestForm.failedToUpdate") : t("evaluationTestForm.failedToCreate"),
    onSuccess: () => handleOpenChange(false),
  });

  const onSubmit = (data: EvaluationTestFormData) => {
    if (saveTestMutation.isPending) return;
    saveTestMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">
            {isEditing ? t("evaluationTestForm.editTest") : t("evaluationTestForm.createNewTest")}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("evaluationTestForm.dialogDescription")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("evaluationTestForm.testName")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("evaluationTestForm.testNamePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("evaluationTestForm.type")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EVALUATION_TEST_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>{t(`evaluationTestForm.type_${type}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("evaluationTestForm.unit")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("evaluationTestForm.unitPlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <p className="text-xs text-muted-foreground bg-muted/40 border border-border rounded-md p-3">
              {type === "time" ? t("evaluationTestForm.directionHintTime") : t("evaluationTestForm.directionHintCount")}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="worstValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("evaluationTestForm.worstValue")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormDescription>
                      {type === "time" ? t("evaluationTestForm.worstValueDescriptionTime") : t("evaluationTestForm.worstValueDescriptionCount")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bestValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("evaluationTestForm.bestValue")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormDescription>
                      {type === "time" ? t("evaluationTestForm.bestValueDescriptionTime") : t("evaluationTestForm.bestValueDescriptionCount")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="rounded-lg border border-dashed border-border p-4 space-y-2">
              <Label htmlFor="evaluation-test-preview">{t("evaluationTestForm.previewLabel")}</Label>
              <div className="flex items-center gap-3 flex-wrap">
                <Input
                  id="evaluation-test-preview"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  placeholder={t("evaluationTestForm.previewPlaceholder")}
                  value={previewValue}
                  onChange={(e) => setPreviewValue(e.target.value)}
                  className="w-32"
                />
                {previewScore !== null ? (
                  <span className="text-sm">
                    {t("evaluationTestForm.previewResult", { score: previewScore })}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">{t("evaluationTestForm.previewHint")}</span>
                )}
              </div>
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("evaluationTestForm.descriptionOptional")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("evaluationTestForm.descriptionPlaceholder")}
                      className="min-h-20"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center justify-end space-x-4 pt-6 border-t border-border">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                className="basketball-orange basketball-orange-hover text-white"
                disabled={saveTestMutation.isPending}
              >
                {saveTestMutation.isPending
                  ? (isEditing ? t("common.saving") : t("common.creating"))
                  : (isEditing ? t("sessionModal.saveChanges") : t("evaluationTestForm.createTest"))}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
