import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import AnimatedNumber from "@/components/AnimatedNumber";

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
}

// Covers the neutral-card + colored-icon-chip stat tile shared by the
// Dashboard and Players stat rows. WeeklySchedule's stat cards use a
// different tinted-card variant (colored gradient background, solid icon
// chip) — deliberately left as-is rather than folding into this component,
// since unifying both styles would need a much wider prop surface for only
// 4 more instances.
// A trailing "%" is the only string shape this ever receives (see call
// sites) — pulling the number back out lets the value count up instead of
// just appearing, without widening the prop to a separate suffix field.
function parseNumeric(value: string | number): { numeric: number; suffix: string } | null {
  if (typeof value === "number") return { numeric: value, suffix: "" };
  const match = /^(-?\d+(?:\.\d+)?)(%?)$/.exec(value);
  if (!match) return null;
  return { numeric: Number(match[1]), suffix: match[2] };
}

export default function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  const colorClasses = COLOR_CLASSES[color];
  const parsed = parseNumeric(value);

  return (
    <Card className={`border-t-2 ${colorClasses.border}`}>
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
          <Icon className={`w-4 h-4 ${colorClasses.icon} opacity-80`} strokeWidth={1.75} aria-hidden="true" />
        </div>
        <p className="font-display font-bold text-4xl tabular-nums text-foreground leading-none">
          {parsed ? <>
            <AnimatedNumber value={parsed.numeric} />
            {parsed.suffix}
          </> : value}
        </p>
      </div>
    </Card>
  );
}
