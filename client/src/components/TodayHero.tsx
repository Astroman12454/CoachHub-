import { Play, Clock, Plus, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TrainingSession } from "@shared/schema";

interface TodayHeroProps {
  teamName?: string;
  todaySession: TrainingSession | null;
  nextSession: TrainingSession | null;
  onStart: (sessionId: number) => void;
  onOpenSession: (sessionId: number) => void;
  onCreateSession: () => void;
  onAddExercises: (session: TrainingSession) => void;
}

// The first thing a coach sees: not stats, not a menu — "here's today's
// practice, tap to start it." Everything else on the dashboard is secondary
// to this one decision.
export default function TodayHero({ teamName, todaySession, nextSession, onStart, onOpenSession, onCreateSession, onAddExercises }: TodayHeroProps) {
  const { t } = useTranslation();
  const isLive = todaySession?.status === "in_progress";
  const isDone = todaySession?.status === "completed";
  // A session with nothing planned is easy to walk into by accident (create
  // it, mean to fill it in later, forget) — flagged here since this is the
  // one place a coach is guaranteed to look before starting practice.
  const hasNoExercises = !!todaySession && !isDone && (todaySession.exerciseIds?.length ?? 0) === 0;

  return (
    <Card className="mb-5 border-basketball-orange/30 overflow-hidden">
      <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-basketball-orange font-semibold mb-1">
            {teamName ? t("dashboard.today.teamToday", { team: teamName }) : t("dashboard.today.today")}
          </p>

          {todaySession ? (
            <>
              <h2 className="font-display font-bold uppercase tracking-tight text-xl sm:text-2xl text-foreground truncate">
                {todaySession.name}
              </h2>
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                  {todaySession.time}
                </span>
                <span>{t("sessions.minutesValue", { count: todaySession.duration })}</span>
                {isLive && (
                  <Badge className="basketball-orange text-white gap-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                    </span>
                    {t("dashboard.today.live")}
                  </Badge>
                )}
                {isDone && <Badge variant="secondary">{t("dashboard.today.completed")}</Badge>}
              </div>
              {hasNoExercises && (
                <button
                  type="button"
                  onClick={() => onAddExercises(todaySession)}
                  className="mt-2 flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400 hover:underline"
                >
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  {t("dashboard.today.noExercisesWarning")}
                </button>
              )}
            </>
          ) : (
            <>
              <h2 className="font-display font-bold uppercase tracking-tight text-xl sm:text-2xl text-foreground">
                {t("dashboard.today.noneToday")}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {nextSession
                  ? t("dashboard.today.nextSession", {
                      name: nextSession.name,
                      date: new Date(`${nextSession.date}T00:00:00`).toLocaleDateString(),
                      time: nextSession.time,
                    })
                  : t("dashboard.today.noSessionsHint")}
              </p>
            </>
          )}
        </div>

        <div className="flex-shrink-0">
          {todaySession && !isDone ? (
            <Button
              size="lg"
              className="basketball-orange basketball-orange-hover text-white font-display uppercase tracking-tight text-base px-8 h-14 w-full sm:w-auto"
              onClick={() => onStart(todaySession.id)}
            >
              <Play className="w-5 h-5 mr-2" strokeWidth={2} aria-hidden="true" />
              {isLive ? t("dashboard.today.continueTraining") : t("dashboard.today.startTraining")}
            </Button>
          ) : todaySession && isDone ? (
            <Button variant="outline" size="lg" className="h-14 w-full sm:w-auto" onClick={() => onOpenSession(todaySession.id)}>
              {t("dashboard.today.viewSession")}
            </Button>
          ) : (
            <Button variant="outline" size="lg" className="h-14 w-full sm:w-auto" onClick={onCreateSession}>
              <Plus className="w-5 h-5 mr-2" strokeWidth={1.75} aria-hidden="true" />
              {t("dashboard.today.createSession")}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
