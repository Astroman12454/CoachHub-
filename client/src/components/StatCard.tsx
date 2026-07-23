import { Card, CardContent } from "@/components/ui/card";

export type StatCardColor = "blue" | "orange" | "purple" | "green";

const COLOR_CLASSES: Record<StatCardColor, { chipBg: string; icon: string }> = {
  blue: { chipBg: "bg-blue-100 dark:bg-blue-950/40", icon: "text-blue-600" },
  orange: { chipBg: "bg-orange-100 dark:bg-orange-950/40", icon: "text-orange-600" },
  purple: { chipBg: "bg-purple-100 dark:bg-purple-950/40", icon: "text-purple-600" },
  green: { chipBg: "bg-green-100 dark:bg-green-950/40", icon: "text-green-600" },
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  color: StatCardColor;
  trend?: {
    value: string;
    label: string;
  };
}

// Covers the neutral-card + colored-icon-chip stat tile shared by the
// Dashboard and Players stat rows. WeeklySchedule's stat cards use a
// different tinted-card variant (colored gradient background, solid icon
// chip) — deliberately left as-is rather than folding into this component,
// since unifying both styles would need a much wider prop surface for only
// 4 more instances.
export default function StatCard({ label, value, icon, color, trend }: StatCardProps) {
  const colorClasses = COLOR_CLASSES[color];

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
          </div>
          <div className={`w-12 h-12 ${colorClasses.chipBg} rounded-lg flex items-center justify-center`}>
            <i className={`${icon} ${colorClasses.icon} text-xl`}></i>
          </div>
        </div>
        {trend && (
          <div className="mt-4 flex items-center text-sm">
            <span className="text-green-600 font-medium">{trend.value}</span>
            <span className="text-gray-500 dark:text-gray-400 ml-2">{trend.label}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
