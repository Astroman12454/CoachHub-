import { CheckCircle2, Users, Dumbbell, StickyNote } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";

interface TrainingSummaryDialogProps {
  open: boolean;
  onDone: () => void;
  sessionName: string;
  presentCount: number;
  totalPlayers: number;
  exercisesCompleted: number;
  notes: string | null;
}

// Shown right after a coach confirms "Finish" in Training Mode, before
// leaving the live view — a quick glance-back at what just happened
// (attendance, exercises run, the note left) instead of dropping straight
// into the sessions list with no closure.
export default function TrainingSummaryDialog({
  open,
  onDone,
  sessionName,
  presentCount,
  totalPlayers,
  exercisesCompleted,
  notes,
}: TrainingSummaryDialogProps) {
  const { t } = useTranslation();
  const restoreFocus = useDialogFocusReturn(open);
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      restoreFocus();
      onDone();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-basketball-orange flex-shrink-0" strokeWidth={2} aria-hidden="true" />
            <DialogTitle className="font-display uppercase tracking-tight">
              {t("trainingMode.summaryTitle")}
            </DialogTitle>
          </div>
          <DialogDescription className="truncate">{sessionName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-md bg-muted p-3">
            <Users className="w-5 h-5 text-muted-foreground flex-shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">{t("trainingMode.summaryAttendance", { present: presentCount, total: totalPlayers })}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-muted p-3">
            <Dumbbell className="w-5 h-5 text-muted-foreground flex-shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">{t("trainingMode.summaryExercises", { count: exercisesCompleted })}</p>
            </div>
          </div>
          {notes && (
            <div className="flex items-start gap-3 rounded-md bg-muted p-3">
              <StickyNote className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm whitespace-pre-wrap">{notes}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            className="w-full basketball-orange basketball-orange-hover text-white"
            onClick={() => handleOpenChange(false)}
            autoFocus
          >
            {t("trainingMode.summaryDone")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
