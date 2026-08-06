import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Team } from "@shared/schema";

interface NewTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function NewTeamDialog({ open, onOpenChange }: NewTeamDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const { switchTeam } = useAuth();
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

  const createTeamMutation = useMutation({
    mutationFn: async (teamName: string) => {
      const res = await apiRequest("POST", "/api/teams", { name: teamName });
      return res.json() as Promise<Team>;
    },
    onSuccess: async (team) => {
      queryClient.invalidateQueries({ queryKey: ["/api/session"] });
      await switchTeam(team.id);
      toast({ title: t("playerForm.success"), description: t("newTeamDialog.createdToast", { name: team.name }) });
      handleOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: t("players.error"),
        description: extractErrorMessage(error) ?? t("newTeamDialog.failedToCreate"),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (createTeamMutation.isPending || !name.trim()) return;
    createTeamMutation.mutate(name.trim());
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">{t("newTeamDialog.newTeam")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("newTeamDialog.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="team-name">{t("newTeamDialog.teamName")}</Label>
            <Input
              id="team-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("newTeamDialog.teamNamePlaceholder")}
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
              disabled={createTeamMutation.isPending || !name.trim()}
            >
              {createTeamMutation.isPending ? t("newTeamDialog.creatingEllipsis") : t("newTeamDialog.createTeam")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
