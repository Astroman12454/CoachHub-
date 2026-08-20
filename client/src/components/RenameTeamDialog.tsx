import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Team } from "@shared/schema";

interface RenameTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: Team | null;
}

// The team switcher (Sidebar.tsx) only offers switching teams or creating
// a new one — nothing in the app let a coach rename the default "My Team"
// away from its signup-time placeholder, on any plan. PUT /api/teams/:id
// already accepts a name update with no plan gate (unlike POST, which
// gates team *count*); this dialog is the missing client-side path to it.
//
// Also the only place to delete a team entirely — there was no way to do
// that anywhere in the app before, for a season that ended or a team
// created by mistake, despite DELETE /api/teams/:id and its cascading
// cleanup already existing server-side.
export default function RenameTeamDialog({
  open,
  onOpenChange,
  team,
}: RenameTeamDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { teams } = useAuth();
  const [, setLocation] = useLocation();
  const isOnlyTeam = teams.length <= 1;

  useEffect(() => {
    if (open && team) setName(team.name);
  }, [open, team]);

  const restoreFocus = useDialogFocusReturn(open);
  const handleOpenChange = (next: boolean) => {
    if (!next) restoreFocus();
    onOpenChange(next);
  };

  const renameTeamMutation = useMutation({
    mutationFn: async (newName: string) => {
      const res = await apiRequest("PUT", `/api/teams/${team!.id}`, {
        name: newName,
      });
      return res.json() as Promise<Team>;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/session"] });
      toast({ title: t("renameTeamDialog.renamedToast") });
      handleOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: t("renameTeamDialog.couldntRename"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/teams/${team!.id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/session"] });
      setIsConfirmDeleteOpen(false);
      handleOpenChange(false);
      toast({
        title: t("renameTeamDialog.deletedToast", { name: team?.name }),
      });
      // The server already picked a replacement team for this session if the
      // deleted one was selected — land somewhere that doesn't assume the
      // just-deleted team's data still exists.
      setLocation("/dashboard");
    },
    onError: (error) => {
      toast({
        title: t("renameTeamDialog.couldntDelete"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (renameTeamMutation.isPending || !name.trim() || !team) return;
    renameTeamMutation.mutate(name.trim());
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-tight">
              {t("renameTeamDialog.title")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("renameTeamDialog.dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="rename-team-name">
                {t("renameTeamDialog.teamName")}
              </Label>
              <Input
                id="rename-team-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("newTeamDialog.teamNamePlaceholder")}
                className="mt-2"
              />
            </div>
            <div className="flex items-center justify-end space-x-4 pt-2 border-t border-border">
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
                disabled={renameTeamMutation.isPending || !name.trim()}
              >
                {renameTeamMutation.isPending
                  ? t("common.saving")
                  : t("common.save")}
              </Button>
            </div>
          </form>

          <div className="pt-4 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full justify-start px-2"
              disabled={isOnlyTeam}
              title={
                isOnlyTeam
                  ? t("renameTeamDialog.onlyTeamCantDelete")
                  : undefined
              }
              onClick={() => setIsConfirmDeleteOpen(true)}
            >
              <Trash2
                className="w-3.5 h-3.5 mr-1.5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {t("renameTeamDialog.deleteTeam")}
            </Button>
            {isOnlyTeam && (
              <p className="text-xs text-muted-foreground px-2 mt-1">
                {t("renameTeamDialog.onlyTeamCantDelete")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={isConfirmDeleteOpen}
        onOpenChange={setIsConfirmDeleteOpen}
        title={t("renameTeamDialog.deleteConfirmTitle")}
        description={t("renameTeamDialog.deleteConfirmDescription", {
          name: team?.name,
        })}
        confirmLabel={t("renameTeamDialog.deleteTeam")}
        isPending={deleteTeamMutation.isPending}
        onConfirm={() => deleteTeamMutation.mutate()}
      />
    </>
  );
}
