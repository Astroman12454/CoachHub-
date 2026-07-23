import { Button } from "@/components/ui/button";

interface AICoachBannerProps {
  onOpenRecommendations: () => void;
}

export default function AICoachBanner({ onOpenRecommendations }: AICoachBannerProps) {
  return (
    <div className="bg-gradient-to-br from-orange-500 via-orange-600 to-red-600 rounded-2xl text-white p-6 shadow-2xl transform hover:scale-105 transition-all duration-300 basketball-pattern relative overflow-hidden">
      <div className="absolute top-0 right-0 w-20 h-20 bg-white bg-opacity-10 rounded-full -translate-y-10 translate-x-10"></div>
      <div className="absolute bottom-0 left-0 w-16 h-16 bg-white bg-opacity-10 rounded-full translate-y-8 -translate-x-8"></div>

      <div className="relative z-10">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
            <i className="fas fa-robot text-white text-xl pulse-orange"></i>
          </div>
          <div>
            <h3 className="text-lg font-bold">AI Coach Assistant</h3>
            <p className="text-orange-100 text-sm">Smart Training Insights</p>
          </div>
        </div>

        <p className="text-orange-100 text-sm mb-4">Based on your team's recent performance data:</p>

        <div className="space-y-3">
          <div className="bg-white bg-opacity-15 rounded-xl p-3 border border-white border-opacity-20">
            <div className="flex items-center space-x-2 mb-1">
              <div className="w-6 h-6 bg-red-400 rounded-lg flex items-center justify-center">
                <i className="fas fa-shield-alt text-white text-xs"></i>
              </div>
              <p className="text-sm font-semibold">Defense Positioning</p>
            </div>
            <p className="text-xs text-orange-100">15% more points allowed in paint</p>
          </div>

          <div className="bg-white bg-opacity-15 rounded-xl p-3 border border-white border-opacity-20">
            <div className="flex items-center space-x-2 mb-1">
              <div className="w-6 h-6 bg-blue-400 rounded-lg flex items-center justify-center">
                <i className="fas fa-basketball-ball text-white text-xs"></i>
              </div>
              <p className="text-sm font-semibold">Free Throw Practice</p>
            </div>
            <p className="text-xs text-orange-100">Current: 68% → Target: 75%</p>
          </div>
        </div>

        <Button
          className="mt-4 w-full bg-white text-orange-600 hover:bg-gray-100 font-semibold py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
          onClick={onOpenRecommendations}
        >
          <i className="fas fa-chart-line mr-2"></i>
          View AI Recommendations
        </Button>
      </div>
    </div>
  );
}
