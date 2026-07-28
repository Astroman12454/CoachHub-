import { Bot, Shield, Target, Activity } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";

interface AIRecommendationsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewCategory: (category: string) => void;
  onCreateSession: () => void;
}

export default function AIRecommendationsModal({
  open,
  onOpenChange,
  onViewCategory,
  onCreateSession,
}: AIRecommendationsModalProps) {
  const restoreFocus = useDialogFocusReturn(open);
  const handleOpenChange = (next: boolean) => {
    if (!next) restoreFocus();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display uppercase tracking-tight">
            <Bot className="w-5 h-5 text-basketball-orange" strokeWidth={1.75} aria-hidden="true" />
            AI Training Recommendations
          </DialogTitle>
          <DialogDescription className="sr-only">
            AI-generated training focus areas based on recent team performance data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="basketball-orange-deep text-white p-4 rounded-lg">
            <h3 className="font-semibold mb-1">Performance Analysis</h3>
            <p className="text-sm text-white/90">Based on recent training data and player performance metrics.</p>
          </div>

          <div className="space-y-3">
            <div className="border border-border rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-md flex items-center justify-center bg-red-50 dark:bg-red-950/40 flex-shrink-0">
                  <Shield className="w-4 h-4 text-red-600" strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">Focus on Defensive Positioning</h3>
                  <p className="text-sm text-muted-foreground mt-1">Your team allowed 15% more points in the paint during the last three games. Consider adding more defensive sliding drills.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => onViewCategory('defense')}
                  >
                    View Defense Exercises
                  </Button>
                </div>
              </div>
            </div>

            <div className="border border-border rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-md flex items-center justify-center bg-blue-50 dark:bg-blue-950/40 flex-shrink-0">
                  <Target className="w-4 h-4 text-blue-600" strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">Improve Free Throw Shooting</h3>
                  <p className="text-sm text-muted-foreground mt-1">Current team average: 68% (Target: 75%). Schedule more shooting practice sessions.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => onViewCategory('shooting')}
                  >
                    View Shooting Exercises
                  </Button>
                </div>
              </div>
            </div>

            <div className="border border-border rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-md flex items-center justify-center bg-success-tint flex-shrink-0">
                  <Activity className="w-4 h-4 text-success" strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">Increase Conditioning Work</h3>
                  <p className="text-sm text-muted-foreground mt-1">Player fatigue was noticeable in the 4th quarter. Add more endurance training.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => onViewCategory('conditioning')}
                  >
                    View Conditioning Exercises
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-4 border-t border-border">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleOpenChange(false)}
            >
              Close
            </Button>
            <Button
              className="flex-1 basketball-orange basketball-orange-hover text-white"
              onClick={onCreateSession}
            >
              Create Training Session
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
