import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useSaveMutation } from "@/hooks/use-save-mutation";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { insertPhysicalTestSchema } from "@shared/schema";
import type { PhysicalTest } from "@shared/schema";

type PhysicalTestFormData = z.infer<typeof insertPhysicalTestSchema>;

interface PhysicalTestFormProps {
  isOpen: boolean;
  onClose: () => void;
  test?: PhysicalTest | null;
}

export default function PhysicalTestForm({ isOpen, onClose, test }: PhysicalTestFormProps) {
  const { t } = useTranslation();
  const isEditing = !!test;
  const restoreFocus = useDialogFocusReturn(isOpen);
  const handleOpenChange = (open: boolean) => {
    if (!open) restoreFocus();
    onClose();
  };

  const form = useForm<PhysicalTestFormData>({
    resolver: zodResolver(insertPhysicalTestSchema),
    defaultValues: {
      name: test?.name ?? "",
      unit: test?.unit ?? "",
      lowerIsBetter: test?.lowerIsBetter === 1 ? 1 : 0,
      description: test?.description ?? "",
    },
  });

  const saveTestMutation = useSaveMutation<PhysicalTestFormData>({
    endpoint: "/api/physical-tests",
    id: test?.id,
    successMessage: isEditing ? t("physicalTestForm.updatedSuccessfully") : t("physicalTestForm.createdSuccessfully"),
    errorMessage: isEditing ? t("physicalTestForm.failedToUpdate") : t("physicalTestForm.failedToCreate"),
    onSuccess: () => handleOpenChange(false),
  });

  const onSubmit = (data: PhysicalTestFormData) => {
    if (saveTestMutation.isPending) return;
    saveTestMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">
            {isEditing ? t("physicalTestForm.editTest") : t("physicalTestForm.createNewTest")}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("physicalTestForm.dialogDescription")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("physicalTestForm.testName")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("physicalTestForm.testNamePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("physicalTestForm.unit")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("physicalTestForm.unitPlaceholder")} {...field} />
                    </FormControl>
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
                  <FormLabel>{t("physicalTestForm.descriptionOptional")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("physicalTestForm.descriptionPlaceholder")}
                      className="min-h-20"
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
              name="lowerIsBetter"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">{t("physicalTestForm.lowerIsBetter")}</FormLabel>
                    <div className="text-sm text-muted-foreground">{t("physicalTestForm.lowerIsBetterDescription")}</div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value === 1}
                      onCheckedChange={(checked) => field.onChange(checked ? 1 : 0)}
                    />
                  </FormControl>
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
                  : (isEditing ? t("sessionModal.saveChanges") : t("physicalTestForm.createTest"))}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
