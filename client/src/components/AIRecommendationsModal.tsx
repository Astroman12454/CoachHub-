import { Bot, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import type { CoachInsight } from "@/lib/insights";

interface AIRecommendationsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  insights: CoachInsight[];
  onViewCategory: (category: string) => void;
  onCreateSession: () => void;
}

export default function AIRecommendationsModal({
  open,
  onOpenChange,
  insights,
  onViewCategory,
  onCreateSession,
}: AIRecommendationsModalProps) {
  const { t } = useTranslation();
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
            {t("dashboard.aiTrainingRecommendations")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("dashboard.aiModalDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="basketball-orange-deep text-white p-4 rounded-lg">
            <h3 className="font-semibold mb-1">{t("dashboard.performanceAnalysis")}</h3>
            <p className="text-sm text-white/90">{t("dashboard.aiModalDescription")}</p>
          </div>

          {insights.length === 0 ? (
            <div className="border border-dashed border-border rounded-lg p-6 text-center">
              <Sparkles className="w-6 h-6 text-muted-foreground mx-auto mb-2" strokeWidth={1.5} aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                {t("dashboard.notEnoughData")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {insights.map((insight) => (
                <div key={insight.id} className="border border-border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${insight.iconBg}`}>
                      <insight.icon className={`w-4 h-4 ${insight.iconColor}`} strokeWidth={1.75} aria-hidden="true" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-foreground">{insight.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
                      {insight.category && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => onViewCategory(insight.category!)}
                        >
                          {t("dashboard.viewCategoryExercises", { category: t(`categories.exercise.${insight.category}`, insight.category) })}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-4 border-t border-border">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleOpenChange(false)}
            >
              {t("common.close")}
            </Button>
            <Button
              className="flex-1 basketball-orange basketball-orange-hover text-white"
              onClick={onCreateSession}
            >
              {t("dashboard.createTrainingSession")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
