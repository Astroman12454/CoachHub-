import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <i className="fas fa-robot text-basketball-orange"></i>
            AI Training Recommendations
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-950/40 dark:to-orange-900/30 p-4 rounded-lg border border-orange-200 dark:border-orange-800/40">
            <h4 className="font-semibold text-orange-800 dark:text-orange-300 mb-2">Performance Analysis</h4>
            <p className="text-sm text-orange-700 dark:text-orange-400">Based on recent training data and player performance metrics.</p>
          </div>

          <div className="space-y-3">
            <div className="border rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-red-100 dark:bg-red-950/40 rounded-lg flex items-center justify-center">
                  <i className="fas fa-shield-alt text-red-600 text-sm"></i>
                </div>
                <div className="flex-1">
                  <h5 className="font-medium text-gray-900 dark:text-gray-100">Focus on Defensive Positioning</h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Your team allowed 15% more points in the paint during the last three games. Consider adding more defensive sliding drills.</p>
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

            <div className="border rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-950/40 rounded-lg flex items-center justify-center">
                  <i className="fas fa-basketball-ball text-blue-600 text-sm"></i>
                </div>
                <div className="flex-1">
                  <h5 className="font-medium text-gray-900 dark:text-gray-100">Improve Free Throw Shooting</h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Current team average: 68% (Target: 75%). Schedule more shooting practice sessions.</p>
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

            <div className="border rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-green-100 dark:bg-green-950/40 rounded-lg flex items-center justify-center">
                  <i className="fas fa-running text-green-600 text-sm"></i>
                </div>
                <div className="flex-1">
                  <h5 className="font-medium text-gray-900 dark:text-gray-100">Increase Conditioning Work</h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Player fatigue was noticeable in the 4th quarter. Add more endurance training.</p>
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

          <div className="flex gap-2 pt-4 border-t">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
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
