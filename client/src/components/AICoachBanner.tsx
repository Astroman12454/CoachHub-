import { Bot, Shield, Target, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AICoachBannerProps {
  onOpenRecommendations: () => void;
}

export default function AICoachBanner({ onOpenRecommendations }: AICoachBannerProps) {
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

      <p className="text-white/90 text-sm mb-4">Based on your team's recent performance data:</p>

      <div className="space-y-2">
        <div className="bg-white/10 rounded-md p-3 border border-white/15">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold">Defense Positioning</p>
          </div>
          <p className="text-xs text-white/90">15% more points allowed in paint</p>
        </div>

        <div className="bg-white/10 rounded-md p-3 border border-white/15">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold">Free Throw Practice</p>
          </div>
          <p className="text-xs text-white/90">Current: 68% → Target: 75%</p>
        </div>
      </div>

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
