import { useTranslation } from "react-i18next";
import { Flame, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { TeamProgressSummary } from "@shared/schema";

interface TeamProgressCardProps {
  progress: TeamProgressSummary | undefined;
}

// The proactive hook the audit said was missing: "no hay racha, no hay
// resumen semanal proactivo... nada se vuelve más valioso con el tiempo."
// Hidden entirely for a brand-new team with nothing to show yet (no streak,
// no attendance data) — a 0-week streak on day one reads as a nag, not a
// hook.
export default function TeamProgressCard({ progress }: TeamProgressCardProps) {
  const { t } = useTranslation();

  if (!progress) return null;
  const { streakWeeks, attendanceRateThisMonth, attendanceRateLastMonth } = progress;
  const hasTrend = attendanceRateThisMonth !== null && attendanceRateLastMonth !== null;
  const delta = hasTrend ? attendanceRateThisMonth! - attendanceRateLastMonth! : 0;
  if (streakWeeks === 0 && attendanceRateThisMonth === null) return null;

  return (
    <Card className="mb-5 border-t-2 border-t-basketball-orange">
      <CardContent className="p-5 flex flex-wrap items-center gap-x-8 gap-y-3">
        {streakWeeks > 0 && (
          <div className="flex items-center gap-2.5">
            <Flame className="w-5 h-5 text-basketball-orange" strokeWidth={2} aria-hidden="true" />
            <p className="text-sm">
              <span className="font-display font-bold text-lg tabular-nums text-foreground mr-1.5">{streakWeeks}</span>
              <span className="text-muted-foreground">{t("dashboard.streakWeeks", { count: streakWeeks })}</span>
            </p>
          </div>
        )}
        {attendanceRateThisMonth !== null && (
          <div className="flex items-center gap-2.5">
            {hasTrend && delta !== 0 && (
              delta > 0
                ? <TrendingUp className="w-4 h-4 text-success" strokeWidth={2} aria-hidden="true" />
                : <TrendingDown className="w-4 h-4 text-destructive" strokeWidth={2} aria-hidden="true" />
            )}
            <p className="text-sm text-muted-foreground">
              {t("dashboard.attendanceThisMonth", { rate: attendanceRateThisMonth })}
              {hasTrend && delta !== 0 && (
                <span className={delta > 0 ? "text-success font-medium" : "text-destructive font-medium"}>
                  {" "}{delta > 0 ? "+" : ""}{delta}{t("dashboard.vsLastMonthSuffix")}
                </span>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
