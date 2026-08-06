import { CalendarRange, Calendar, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { TrainingSession } from "@shared/schema";

interface UpcomingSessionsCardProps {
  sessions: TrainingSession[];
  onSessionClick: (sessionId: number) => void;
  onViewAll: () => void;
}

export default function UpcomingSessionsCard({ sessions, onSessionClick, onViewAll }: UpcomingSessionsCardProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b border-border">
        <div className="flex items-center gap-2.5">
          <CalendarRange className="w-4.5 h-4.5 text-basketball-orange" strokeWidth={1.75} aria-hidden="true" />
          <CardTitle className="text-base">{t("dashboard.upcomingTrainingSessions")}</CardTitle>
        </div>
        <Button
          variant="link"
          className="text-basketball-orange hover:text-basketball-orange-hover font-semibold"
          onClick={onViewAll}
        >
          {t("dashboard.viewAll")} →
        </Button>
      </CardHeader>
      <div>
        {sessions.length === 0 ? (
          <p className="text-muted-foreground text-center py-10 text-sm">{t("dashboard.noUpcomingSessions")}</p>
        ) : (
          sessions.map((session) => {
            const attendanceCount = session.attendanceCount ?? 0;
            const totalPlayers = session.totalPlayers || 1;
            const pct = Math.round((attendanceCount / totalPlayers) * 100);

            return (
              <div
                key={session.id}
                className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-b-0 hover:bg-muted/60 transition-colors cursor-pointer group"
                onClick={() => onSessionClick(session.id)}
              >
                <div className="w-11 h-11 flex-shrink-0 rounded-md basketball-orange-deep text-white flex items-center justify-center font-display font-bold tabular-nums text-sm">
                  {attendanceCount || "—"}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground group-hover:text-basketball-orange transition-colors truncate">{session.name}</h3>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" strokeWidth={1.75} aria-hidden="true" />
                      {session.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" strokeWidth={1.75} aria-hidden="true" />
                      {session.time}
                    </span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 w-24">
                  <p className="font-display font-semibold tabular-nums text-sm text-foreground mb-1.5">
                    {attendanceCount}/{session.totalPlayers}
                  </p>
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-success rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
