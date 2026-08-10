import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useSaveMutation } from "@/hooks/use-save-mutation";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { insertExerciseSchema } from "@shared/schema";
import type { Exercise } from "@shared/schema";
import { EXERCISE_CATEGORIES, DIFFICULTY_LEVELS, type ExerciseCategory, type DifficultyLevel } from "@/lib/types";

type ExerciseFormData = z.infer<typeof insertExerciseSchema>;

interface ExerciseFormProps {
  isOpen: boolean;
  onClose: () => void;
  exercise?: Exercise | null;
  /** A drill to prefill from when creating a variant — everything is
   * copied over, but this still creates a brand-new exercise (POST, not
   * PUT): `exercise` stays unset, so `isEditing` is false. */
  duplicateFrom?: Exercise | null;
}

export default function ExerciseForm({ isOpen, onClose, exercise, duplicateFrom }: ExerciseFormProps) {
  const { t } = useTranslation();
  const isEditing = !!exercise;
  const source = exercise ?? duplicateFrom ?? null;
  const restoreFocus = useDialogFocusReturn(isOpen);
  const handleOpenChange = (open: boolean) => {
    if (!open) restoreFocus();
    onClose();
  };

  const form = useForm<ExerciseFormData>({
    resolver: zodResolver(insertExerciseSchema),
    defaultValues: {
      name: duplicateFrom ? t("exerciseForm.duplicateName", { name: duplicateFrom.name }) : source?.name ?? "",
      description: source?.description ?? "",
      category: (source?.category as ExerciseCategory) ?? "shooting",
      duration: source?.duration ?? 15,
      difficulty: (source?.difficulty as DifficultyLevel) ?? "medium",
      instructions: source?.instructions ?? "",
      imageUrl: source?.imageUrl ?? "",
    },
  });

  const saveExerciseMutation = useSaveMutation<ExerciseFormData>({
    endpoint: "/api/exercises",
    id: exercise?.id,
    successMessage: isEditing ? t("exerciseForm.updatedSuccessfully") : t("exerciseForm.createdSuccessfully"),
    errorMessage: isEditing ? t("exerciseForm.failedToUpdate") : t("exerciseForm.failedToCreate"),
    onSuccess: () => handleOpenChange(false),
  });

  const onSubmit = (data: ExerciseFormData) => {
    if (saveExerciseMutation.isPending) return;
    saveExerciseMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">
            {isEditing ? t("exerciseForm.editExercise") : duplicateFrom ? t("exerciseForm.duplicateExercise") : t("exerciseForm.createNewExercise")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("exerciseForm.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("exerciseForm.exerciseName")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("exerciseForm.exerciseNamePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sessionModal.durationMinutes")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("playEditor.category")}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("exerciseForm.selectCategory")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EXERCISE_CATEGORIES.map(category => (
                          <SelectItem key={category} value={category}>
                            {t(`categories.exercise.${category}`, category)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="difficulty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("exerciseForm.difficulty")}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("exerciseForm.selectDifficulty")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DIFFICULTY_LEVELS.map(difficulty => (
                          <SelectItem key={difficulty} value={difficulty}>
                            {t(`categories.difficulty.${difficulty}`, difficulty)}
                          </SelectItem>
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("exerciseForm.description")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("exerciseForm.descriptionPlaceholder")}
                      className="min-h-20"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="instructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("exerciseForm.instructionsOptional")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("exerciseForm.instructionsPlaceholder")}
                      className="min-h-32"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("exerciseForm.imageUrlOptional")}</FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      placeholder="https://example.com/image.jpg"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center justify-end space-x-4 pt-6 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                className="basketball-orange basketball-orange-hover text-white"
                disabled={saveExerciseMutation.isPending}
              >
                {saveExerciseMutation.isPending
                  ? (isEditing ? t("common.saving") : t("common.creating"))
                  : (isEditing ? t("sessionModal.saveChanges") : t("exerciseForm.createExercise"))}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
