import { Bot, TrendingUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CoachInsight } from "@/lib/insights";

interface AICoachBannerProps {
  insights: CoachInsight[];
  onOpenRecommendations: () => void;
}

export default function AICoachBanner({ insights, onOpenRecommendations }: AICoachBannerProps) {
  const preview = insights.slice(0, 2);

  return (
    <div className="basketball-orange-deep rounded-lg text-white p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-white/15 rounded-md flex items-center justify-center">
          <Bot className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
        </div>
        <div>
          <h3 className="font-display font-bold uppercase tracking-tight text-lg leading-tight">AI Coach Assistant</h3>
          <p className="text-white/90 text-sm">Smart Training Insights</p>
        </div>
      </div>

      {preview.length > 0 ? (
        <>
          <p className="text-white/90 text-sm mb-4">Based on your team's actual training data:</p>
          <div className="space-y-2">
            {preview.map((insight) => (
              <div key={insight.id} className="bg-white/10 rounded-md p-3 border border-white/15">
                <div className="flex items-center gap-2 mb-1">
                  <insight.icon className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-sm font-semibold">{insight.title}</p>
                </div>
                <p className="text-xs text-white/90">{insight.description}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="bg-white/10 rounded-md p-3 border border-white/15 mb-4 flex items-center gap-2">
          <Sparkles className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm text-white/90">Add exercises and complete a few sessions to unlock insights.</p>
        </div>
      )}

      <Button
        className="mt-4 w-full bg-white text-basketball-orange hover:bg-orange-50"
        onClick={onOpenRecommendations}
      >
        <TrendingUp className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
        View AI Recommendations
      </Button>
    </div>
  );
}
