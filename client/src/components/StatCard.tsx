import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export type StatCardColor = "orange" | "court" | "violet" | "success";

const COLOR_CLASSES: Record<StatCardColor, { border: string; icon: string }> = {
  orange: { border: "border-t-basketball-orange", icon: "text-basketball-orange" },
  court: { border: "border-t-court", icon: "text-court" },
  violet: { border: "border-t-info", icon: "text-info" },
  success: { border: "border-t-success", icon: "text-success" },
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
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
export default function StatCard({ label, value, icon: Icon, color, trend }: StatCardProps) {
  const colorClasses = COLOR_CLASSES[color];

  return (
    <Card className={`border-t-2 ${colorClasses.border}`}>
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
          <Icon className={`w-4 h-4 ${colorClasses.icon} opacity-80`} strokeWidth={1.75} aria-hidden="true" />
        </div>
        <p className="font-display font-bold text-4xl tabular-nums text-foreground leading-none">{value}</p>
        {trend && (
          <div className="mt-2.5 flex items-center text-sm">
            <span className="text-success font-medium">{trend.value}</span>
            <span className="text-muted-foreground ml-2">{trend.label}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
