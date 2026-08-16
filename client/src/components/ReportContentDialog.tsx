import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { REPORT_REASONS, type ReportReason } from "@shared/schema";

const MAX_DETAILS_LENGTH = 500;

// What's being reported and where the report POSTs to — endpoint is the
// full path (e.g. `/api/community-exercises/5/report`), already specific
// to the content type, so this one dialog works for exercises, plays, and
// evaluation tests alike without needing to know which.
export interface ReportTarget {
  endpoint: string;
  name: string;
}

interface ReportContentDialogProps {
  target: ReportTarget | null;
  onOpenChange: (open: boolean) => void;
}

// Opened from the flag icon on a community card (see CommunityExercises/
// CommunityPlays/CommunityEvaluations) — reports go straight to an admin's
// review queue (GET /api/admin/reports), never shown to other coaches, so
// this asks nothing about the reporter's identity.
export default function ReportContentDialog({ target, onOpenChange }: ReportContentDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const open = target !== null;

  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");

  const restoreFocus = useDialogFocusReturn(open);
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      restoreFocus();
      setReason("spam");
      setDetails("");
    }
    onOpenChange(next);
  };

  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!target) return;
      await apiRequest("POST", target.endpoint, { reason, details: details.trim() || undefined });
    },
    onSuccess: () => {
      toast({ title: t("reportContentDialog.submitted") });
      handleOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: t("reportContentDialog.couldntSubmit"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight flex items-center gap-2">
            <Flag className="w-4 h-4 text-destructive" strokeWidth={1.75} aria-hidden="true" />
            {t("reportContentDialog.title")}
          </DialogTitle>
          <DialogDescription>{target ? t("reportContentDialog.description", { name: target.name }) : ""}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Select value={reason} onValueChange={(v) => setReason(v as ReportReason)}>
            <SelectTrigger aria-label={t("reportContentDialog.reasonLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPORT_REASONS.map((r) => (
                <SelectItem key={r} value={r}>{t(`reportContentDialog.reasons.${r}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value.slice(0, MAX_DETAILS_LENGTH))}
            placeholder={t("reportContentDialog.detailsPlaceholder")}
            aria-label={t("reportContentDialog.detailsPlaceholder")}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => reportMutation.mutate()}
            disabled={reportMutation.isPending}
          >
            {t("reportContentDialog.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
