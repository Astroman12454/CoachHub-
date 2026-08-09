import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CalendarDays, CheckCircle2, Clock, Users, CalendarPlus, Repeat } from "lucide-react";
import { useTranslation } from "react-i18next";
import TopBar from "@/components/TopBar";
import AttendanceModal from "@/components/AttendanceModal";
import RecurringScheduleDialog from "@/components/RecurringScheduleDialog";
import StatCard from "@/components/StatCard";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import { useSessionAttendance } from "@/hooks/use-session-attendance";
import type { TrainingSession, Player, PlayerInjury } from "@shared/schema";

const DAYS_OF_WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

// Left-border accent + neutral card background — a status color that reads
// as a marker on a stat sheet rather than a full pastel-filled block.
const STATUS_COLORS = {
  scheduled: "border-l-blue-500",
  in_progress: "border-l-basketball-orange",
  completed: "border-l-success",
  cancelled: "border-l-border"
};

export default function WeeklySchedule() {
  const { t } = useTranslation();
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);
    return monday;
  });
  const [selectedSession, setSelectedSession] = useState<TrainingSession | null>(null);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [isRecurringDialogOpen, setIsRecurringDialogOpen] = useState(false);

  // Calculate week dates
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(selectedWeek);
    date.setDate(selectedWeek.getDate() + i);
    return date;
  });

  const startDate = weekDates[0].toISOString().split('T')[0];
  const endDate = weekDates[6].toISOString().split('T')[0];

  const { data: sessions = [], isLoading: sessionsLoading, isError: sessionsError, refetch: refetchSessions } = useQuery<TrainingSession[]>({
    queryKey: ['/api/training-sessions', startDate, endDate],
    queryFn: async () => {
      const response = await fetch(`/api/training-sessions?startDate=${startDate}&endDate=${endDate}`);
      if (!response.ok) throw new Error('Failed to fetch sessions');
      return response.json();
    },
  });

  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ['/api/players'],
  });

  const { data: activeInjuries = [] } = useQuery<PlayerInjury[]>({
    queryKey: ['/api/players/injuries'],
  });
  const injuredPlayerIds = new Set(activeInjuries.map((injury) => injury.playerId));

  const { attendance, isLoading: attendanceLoading, toggleAttendance: handleAttendanceToggle, markAllPresent, pendingPlayerId } =
    useSessionAttendance(selectedSession?.id);

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newWeek = new Date(selectedWeek);
    newWeek.setDate(selectedWeek.getDate() + (direction === 'next' ? 7 : -7));
    setSelectedWeek(newWeek);
  };

  const openAttendanceModal = (session: TrainingSession) => {
    setSelectedSession(session);
    setIsAttendanceModalOpen(true);
  };

  const getSessionsForDate = (date: Date) => {
    const dateString = date.toISOString().split('T')[0];
    return Array.isArray(sessions) ? sessions.filter(session => session.date === dateString) : [];
  };

  const getWeekStats = () => {
    const sessionsArray = Array.isArray(sessions) ? sessions : [];
    return {
      total: sessionsArray.length,
      completed: sessionsArray.filter(s => s.status === 'completed').length,
      scheduled: sessionsArray.filter(s => s.status === 'scheduled').length,
      totalAttendance: sessionsArray.reduce((acc, session) => acc + (session.attendanceCount || 0), 0)
    };
  };

  const weekStats = getWeekStats();

  if (sessionsLoading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar
          title={t("nav.weeklySchedule")}
          subtitle={t("schedule.subtitleLoading")}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Skeleton className="h-96 w-full" />
        </main>
      </div>
    );
  }

  if (sessionsError) {
    return (
      <div className="flex flex-col h-full">
        <TopBar
          title={t("nav.weeklySchedule")}
          subtitle={t("schedule.subtitle")}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorState onRetry={() => refetchSessions()} />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title={t("nav.weeklySchedule")}
        subtitle={t("schedule.subtitle")}
      />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setIsRecurringDialogOpen(true)}>
            <Repeat className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
            {t("recurringSchedule.openButton")}
          </Button>
        </div>

        {/* Header with Week Navigation */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-4">
          <div className="col-span-2 text-center sm:col-span-1 sm:order-2">
            <h2 className="font-display font-bold uppercase tracking-tight text-xl sm:text-2xl text-foreground">
              {weekDates[0].toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - {' '}
              {weekDates[6].toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </h2>
            <p className="text-muted-foreground mt-0.5 text-sm">{t("schedule.trainingScheduleOverview")}</p>
          </div>

          <Button variant="outline" onClick={() => navigateWeek('prev')} className="flex items-center justify-center gap-2 sm:order-1">
            <ChevronLeft className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            <span className="sm:hidden">{t("schedule.previous")}</span>
            <span className="hidden sm:inline">{t("schedule.previousWeek")}</span>
          </Button>

          <Button variant="outline" onClick={() => navigateWeek('next')} className="flex items-center justify-center gap-2 sm:order-3">
            <span className="sm:hidden">{t("schedule.next")}</span>
            <span className="hidden sm:inline">{t("schedule.nextWeek")}</span>
            <ChevronRight className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>

        {/* Weekly Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label={t("dashboard.totalSessions")} value={weekStats.total} icon={CalendarDays} color="orange" />
          <StatCard label={t("schedule.completed")} value={weekStats.completed} icon={CheckCircle2} color="success" />
          <StatCard label={t("schedule.upcoming")} value={weekStats.scheduled} icon={Clock} color="court" />
          <StatCard label={t("sessions.attendance")} value={weekStats.totalAttendance} icon={Users} color="violet" />
        </div>

        {/* Weekly Calendar */}
        <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
          {weekDates.map((date, index) => {
            const dayKey = DAYS_OF_WEEK[index];
            const daySessions = getSessionsForDate(date);
            const isToday = date.toDateString() === new Date().toDateString();

            return (
              <Card
                key={index}
                className={isToday ? 'ring-2 ring-basketball-orange' : ''}
              >
                <CardHeader className="pb-3 border-b border-border">
                  <div className="text-center">
                    <div className="font-display font-bold uppercase text-base text-foreground">{t(`schedule.days.${dayKey}.short`)}</div>
                    <div className="text-xs text-muted-foreground">{t(`schedule.days.${dayKey}.full`)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    {isToday && (
                      <Badge className="mt-2 basketball-orange text-white">{t("schedule.today")}</Badge>
                    )}
                  </div>
                </CardHeader>
                <div className="p-2.5 space-y-2">
                  {daySessions.length === 0 ? (
                    <div className="text-center py-8">
                      <CalendarPlus className="w-5 h-5 text-muted-foreground/50 mx-auto mb-2" strokeWidth={1.5} aria-hidden="true" />
                      <p className="text-xs text-muted-foreground">{t("schedule.noSessions")}</p>
                    </div>
                  ) : (
                    daySessions.map((session) => (
                      <div
                        key={session.id}
                        role="button"
                        tabIndex={0}
                        aria-label={t("schedule.sessionAriaLabel", { name: session.name, time: session.time, duration: session.duration })}
                        className={`rounded-md p-3 cursor-pointer transition-colors bg-muted/50 hover:bg-muted border-l-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                          STATUS_COLORS[session.status as keyof typeof STATUS_COLORS] || STATUS_COLORS.scheduled
                        }`}
                        onClick={() => openAttendanceModal(session)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openAttendanceModal(session);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className="text-xs">
                            {session.time}
                          </Badge>
                          <div className="text-xs font-medium tabular-nums text-muted-foreground">
                            {t("schedule.durationMinNoSpace", { count: session.duration })}
                          </div>
                        </div>
                        <div className="font-semibold text-sm truncate mb-1.5 text-foreground">
                          {session.name}
                        </div>
                        <div className="flex items-center justify-between">
                          <Badge
                            variant="secondary"
                            className="text-xs capitalize"
                          >
                            {t(`schedule.status.${session.status || 'scheduled'}`, session.status || 'scheduled')}
                          </Badge>
                          {session.attendanceCount !== undefined && (
                            <div className="text-xs tabular-nums text-muted-foreground">
                              {session.attendanceCount}/{session.totalPlayers}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        <AttendanceModal
          open={isAttendanceModalOpen}
          onOpenChange={setIsAttendanceModalOpen}
          session={selectedSession}
          players={players}
          attendance={attendance}
          isLoading={attendanceLoading}
          injuredPlayerIds={injuredPlayerIds}
          onToggleAttendance={handleAttendanceToggle}
          onMarkAllPresent={() => markAllPresent(players.filter((p) => p.isActive === 1).map((p) => p.id))}
          pendingPlayerId={pendingPlayerId}
        />

        <RecurringScheduleDialog open={isRecurringDialogOpen} onOpenChange={setIsRecurringDialogOpen} />
      </main>
    </div>
  );
}
