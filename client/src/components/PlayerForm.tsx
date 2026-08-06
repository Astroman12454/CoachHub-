import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useSaveMutation } from "@/hooks/use-save-mutation";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { insertPlayerSchema } from "@shared/schema";

type PlayerFormData = z.infer<typeof insertPlayerSchema>;

const positions = [
  "Point Guard",
  "Shooting Guard",
  "Small Forward",
  "Power Forward",
  "Center"
];

interface PlayerFormProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PlayerForm({ isOpen, onClose }: PlayerFormProps) {
  const { t } = useTranslation();
  const restoreFocus = useDialogFocusReturn(isOpen);
  const handleOpenChange = (open: boolean) => {
    if (!open) restoreFocus();
    onClose();
  };

  const form = useForm<PlayerFormData>({
    resolver: zodResolver(insertPlayerSchema),
    defaultValues: {
      name: "",
      position: "Point Guard",
      isActive: 1,
    },
  });

  const createPlayerMutation = useSaveMutation<PlayerFormData>({
    endpoint: "/api/players",
    successTitle: t("playerForm.success"),
    successMessage: t("playerForm.addedSuccessfully"),
    errorMessage: t("playerForm.failedToAdd"),
    onSuccess: () => handleOpenChange(false),
  });

  const onSubmit = (data: PlayerFormData) => {
    if (createPlayerMutation.isPending) return;
    createPlayerMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">{t("playerForm.addNewPlayer")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("playerForm.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("playerForm.playerName")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("playerForm.playerNamePlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="position"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("playerForm.position")}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value ?? undefined}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("playerForm.selectPosition")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {positions.map(position => (
                        <SelectItem key={position} value={position}>
                          {t(`playerForm.positions.${position}`, position)}
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
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      {t("playerForm.activePlayer")}
                    </FormLabel>
                    <div className="text-sm text-muted-foreground">
                      {t("playerForm.activePlayerDescription")}
                    </div>
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
                disabled={createPlayerMutation.isPending}
              >
                {createPlayerMutation.isPending ? t("playerForm.adding") : t("dashboard.addPlayer")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
