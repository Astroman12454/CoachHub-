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
import type { Player } from "@shared/schema";

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
  player?: Player | null;
}

export default function PlayerForm({ isOpen, onClose, player }: PlayerFormProps) {
  const { t } = useTranslation();
  const isEditing = !!player;
  const restoreFocus = useDialogFocusReturn(isOpen);
  const handleOpenChange = (open: boolean) => {
    if (!open) restoreFocus();
    onClose();
  };

  const form = useForm<PlayerFormData>({
    resolver: zodResolver(insertPlayerSchema),
    defaultValues: {
      name: player?.name ?? "",
      position: player?.position ?? "Point Guard",
      isActive: player?.isActive ?? 1,
      jerseyNumber: player?.jerseyNumber ?? undefined,
      birthDate: player?.birthDate ?? "",
      height: player?.height ?? undefined,
    },
  });

  const savePlayerMutation = useSaveMutation<PlayerFormData>({
    endpoint: "/api/players",
    id: player?.id,
    successMessage: isEditing ? t("playerForm.updatedSuccessfully") : t("playerForm.addedSuccessfully"),
    errorMessage: isEditing ? t("playerForm.failedToUpdate") : t("playerForm.failedToAdd"),
    onSuccess: () => handleOpenChange(false),
  });

  const onSubmit = (data: PlayerFormData) => {
    if (savePlayerMutation.isPending) return;
    // Empty string means "not entered" here, but the field is a nullable
    // date column — send null instead of "" so it clears cleanly on an
    // edit rather than failing the schema's date-format check.
    savePlayerMutation.mutate({ ...data, birthDate: data.birthDate || null });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">
            {isEditing ? t("playerForm.editPlayer") : t("playerForm.addNewPlayer")}
          </DialogTitle>
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

            <div className="grid grid-cols-2 gap-4">
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
                name="jerseyNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("playerForm.jerseyNumber")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder={t("playerForm.jerseyNumberPlaceholder")}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="birthDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("playerForm.birthDate")}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="height"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("playerForm.height")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder={t("playerForm.heightPlaceholder")}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                disabled={savePlayerMutation.isPending}
              >
                {savePlayerMutation.isPending
                  ? (isEditing ? t("common.saving") : t("playerForm.adding"))
                  : (isEditing ? t("common.save") : t("dashboard.addPlayer"))}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
