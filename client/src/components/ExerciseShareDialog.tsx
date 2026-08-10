import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Check, Share2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import type { Exercise } from "@shared/schema";

interface ExerciseShareDialogProps {
  exercise: Exercise | null;
  onOpenChange: (open: boolean) => void;
}

// A read-only link to one drill — same unguessable-token pattern as
// PlayerPortalDialog. Generates (or reuses) the link the moment the dialog
// opens, since there's nothing else to configure first.
export default function ExerciseShareDialog({ exercise, onOpenChange }: ExerciseShareDialogProps) {
  const { t } = useTranslation();
  const open = !!exercise;
  const restoreFocus = useDialogFocusReturn(open);
  const { toast } = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const linkMutation = useMutation({
    mutationFn: async (exerciseId: number) => {
      const res = await apiRequest("POST", `/api/exercises/${exerciseId}/share-link`);
      return (await res.json()) as { token: string };
    },
    onSuccess: (data) => {
      setUrl(`${window.location.origin}/exercise/${data.token}`);
    },
    onError: (error) => {
      toast({ title: t("exerciseShareDialog.couldntCreateLink"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (exerciseId: number) => apiRequest("DELETE", `/api/exercises/${exerciseId}/share-link`),
    onSuccess: () => {
      setUrl(null);
      setCopied(false);
      toast({ title: t("exerciseShareDialog.linkRevoked"), description: t("exerciseShareDialog.linkRevokedDescription") });
    },
    onError: (error) => {
      toast({ title: t("exerciseShareDialog.couldntRevokeLink"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    },
  });

  useEffect(() => {
    if (exercise) {
      setUrl(null);
      setCopied(false);
      linkMutation.mutate(exercise.id);
    }
    // Only re-run when the dialog is opened for a (possibly different) exercise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise?.id]);

  const handleOpenChange = (next: boolean) => {
    if (!next) restoreFocus();
    onOpenChange(next);
  };

  const copyLink = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: t("exerciseShareDialog.copied"), description: t("exerciseShareDialog.copiedDescription") });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight flex items-center gap-2">
            <Share2 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            {t("exerciseShareDialog.shareLink")}
          </DialogTitle>
          <DialogDescription>
            {t("exerciseShareDialog.dialogDescription", { name: exercise?.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            value={linkMutation.isPending ? t("exerciseShareDialog.generatingEllipsis") : url ?? ""}
            readOnly
            aria-label={t("exerciseShareDialog.shareLinkLower")}
            className="font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button type="button" size="icon" variant="outline" onClick={copyLink} disabled={!url} aria-label={t("exerciseShareDialog.copyLink")}>
            {copied ? <Check className="w-4 h-4" strokeWidth={2} aria-hidden="true" /> : <Copy className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
          </Button>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="text-red-700 hover:text-red-800 dark:hover:text-red-400"
            onClick={() => exercise && revokeMutation.mutate(exercise.id)}
            disabled={!url || revokeMutation.isPending}
          >
            <Trash2 className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
            {t("exerciseShareDialog.revokeLink")}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("exerciseShareDialog.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
