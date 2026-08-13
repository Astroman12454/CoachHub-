import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SetPublicNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the name is saved — the caller retries whatever action
   * (publishing an exercise, following a coach) triggered this dialog. */
  onSuccess?: () => void;
}

// Publishing to the community library or following another coach both need
// a name to show — but this app has otherwise never asked a coach for one
// (only email, which stays private). This dialog is the one-time prompt for
// that, opened by whichever action first needs it (PUT .../share-community
// and POST .../follow both reject with 409 PUBLIC_NAME_REQUIRED until it's
// set) — never shown unprompted.
export default function SetPublicNameDialog({ open, onOpenChange, onSuccess }: SetPublicNameDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const restoreFocus = useDialogFocusReturn(open);
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      restoreFocus();
      setName("");
    }
    onOpenChange(next);
  };

  const savePublicNameMutation = useMutation({
    mutationFn: async (publicName: string) => {
      const res = await apiRequest("PUT", "/api/account/public-name", { publicName });
      return res.json() as Promise<{ publicName: string }>;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/session"] });
      handleOpenChange(false);
      onSuccess?.();
    },
    onError: (error) => {
      toast({
        title: t("setPublicNameDialog.couldntSave"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (savePublicNameMutation.isPending || !name.trim()) return;
    savePublicNameMutation.mutate(name.trim());
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">{t("setPublicNameDialog.title")}</DialogTitle>
          <DialogDescription>{t("setPublicNameDialog.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="public-name-input">{t("setPublicNameDialog.label")}</Label>
            <Input
              id="public-name-input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("setPublicNameDialog.placeholder")}
              maxLength={40}
              className="mt-2"
            />
          </div>
          <div className="flex items-center justify-end space-x-4 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              className="basketball-orange basketball-orange-hover text-white"
              disabled={savePublicNameMutation.isPending || name.trim().length < 2}
            >
              {savePublicNameMutation.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
