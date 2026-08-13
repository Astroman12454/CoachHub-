import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import TopBar from "@/components/TopBar";
import SessionModal from "@/components/SessionModal";
import CommandBar from "@/components/CommandBar";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import TodayHero from "@/components/TodayHero";
import DashboardStatsGrid, { type DashboardStats } from "@/components/DashboardStatsGrid";
import UpcomingSessionsCard from "@/components/UpcomingSessionsCard";
import QuickActionsCard from "@/components/QuickActionsCard";
import ExerciseCategoriesCard from "@/components/ExerciseCategoriesCard";
import AICoachBanner from "@/components/AICoachBanner";
import AIRecommendationsModal from "@/components/AIRecommendationsModal";
import RecentExercisesCard from "@/components/RecentExercisesCard";
import WelcomeFollowCoachesDialog from "@/components/WelcomeFollowCoachesDialog";
import { computeInsights } from "@/lib/insights";
import { useAuth } from "@/hooks/use-auth";
import type { Exercise, TrainingSession, RecurringPracticeSlot } from "@shared/schema";

export default function Dashboard() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { teams, currentTeamId } = useAuth();
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [sessionPrefill, setSessionPrefill] = useState<{ name?: string | null; date?: string; time?: string | null; duration?: number | null } | null>(null);
  const [duplicateFromSession, setDuplicateFromSession] = useState<TrainingSession | null>(null);
  const [editingSession, setEditingSession] = useState<TrainingSession | null>(null);

  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useQuery<DashboardStats>({
    queryKey: ['/api/stats'],
  });

  const { data: sessions = [], isLoading: sessionsLoading, isError: sessionsError, refetch: refetchSessions } = useQuery<TrainingSession[]>({
    queryKey: ['/api/training-sessions'],
  });

  const { data: exercises = [], isLoading: exercisesLoading, isError: exercisesError, refetch: refetchExercises } = useQuery<Exercise[]>({
    queryKey: ['/api/exercises'],
  });

  const { data: recurringSlots = [] } = useQuery<RecurringPracticeSlot[]>({
    queryKey: ['/api/recurring-slots'],
  });

  const currentTeam = useMemo(() => teams.find((team) => team.id === currentTeamId), [teams, currentTeamId]);

  // Today's date as YYYY-MM-DD, matching how session.date is stored/compared
  // everywhere else in the app (WeeklySchedule, TrainingMode).
  const todayString = useMemo(() => new Date().toISOString().split("T")[0], []);

  // The session the "Hoy" hero cares about: today's, preferring one already
  // in progress (the coach came back mid-practice) over a merely-scheduled one.
  const todaySession = useMemo(() => {
    const todays = sessions
      .filter((s) => s.date === todayString && s.status !== "cancelled")
      .sort((a, b) => a.time.localeCompare(b.time));
    return todays.find((s) => s.status === "in_progress") ?? todays[0] ?? null;
  }, [sessions, todayString]);

  const nextSession = useMemo(() => {
    return [...sessions]
      .filter((s) => s.status === "scheduled" && s.date > todayString)
      .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))[0] ?? null;
  }, [sessions, todayString]);

  // Upcoming sessions (next 3) — scheduled and not in the past. The previous
  // version was an unfiltered `sessions.slice(0, 3)`, which could surface
  // already-past sessions depending on fetch order.
  const upcomingSessions = useMemo(() => {
    return [...sessions]
      .filter((s) => s.status === "scheduled" && s.date >= todayString)
      .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))
      .slice(0, 3);
  }, [sessions, todayString]);

  // Most recently completed session, for the "repeat last session" shortcut —
  // most recent by date, then by time within that date.
  const lastCompletedSession = useMemo(() => {
    return [...sessions]
      .filter((s) => s.status === "completed")
      .sort((a, b) => (a.date === b.date ? b.time.localeCompare(a.time) : b.date.localeCompare(a.date)))[0] ?? null;
  }, [sessions]);

  // Next date to prefill the duplicate onto: the soonest upcoming date that
  // matches a recurring slot's weekday, or tomorrow if the team has none.
  const nextRepeatDate = useMemo(() => {
    const tomorrow = new Date(`${todayString}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    if (recurringSlots.length === 0) {
      return tomorrow.toISOString().split("T")[0];
    }
    const slotDays = new Set(recurringSlots.map((slot) => slot.dayOfWeek));
    const candidate = new Date(tomorrow);
    for (let i = 0; i < 7; i++) {
      if (slotDays.has(candidate.getUTCDay())) {
        return candidate.toISOString().split("T")[0];
      }
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }
    return tomorrow.toISOString().split("T")[0];
  }, [recurringSlots, todayString]);

  const handleRepeatLastSession = () => {
    if (!lastCompletedSession) return;
    setDuplicateFromSession({ ...lastCompletedSession, date: nextRepeatDate });
  };

  // Get recent exercises (last 3 added)
  const recentExercises = exercises.slice(-3);

  // Calculate exercise counts by category
  const exercisesByCategory = useMemo(() => {
    return exercises.reduce((acc, exercise) => {
      acc[exercise.category] = (acc[exercise.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [exercises]);

  const insights = useMemo(() => computeInsights(sessions, exercises, t), [sessions, exercises, t]);

  // Navigation functions
  const navigateToPage = (path: string) => {
    setLocation(path);
  };

  const handleCategoryClick = (category: string) => {
    navigateToPage(`/exercise-library?category=${category}`);
  };

  const handleSessionClick = (sessionId: number) => {
    navigateToPage('/weekly-schedule');
  };

  const handleExerciseClick = (exerciseId: number) => {
    navigateToPage('/exercise-library');
  };

  const closeSessionModal = () => {
    setIsSessionModalOpen(false);
    setSessionPrefill(null);
    setDuplicateFromSession(null);
  };

  const closeEditingSession = () => setEditingSession(null);

  if (statsLoading || sessionsLoading || exercisesLoading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar
          title={t("dashboard.title")}
          subtitle={t("dashboard.subtitle")}
          showNewSessionButton={true}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (statsError || sessionsError || exercisesError) {
    return (
      <div className="flex flex-col h-full">
        <TopBar
          title={t("dashboard.title")}
          subtitle={t("dashboard.subtitle")}
          showNewSessionButton={true}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorState onRetry={() => { refetchStats(); refetchSessions(); refetchExercises(); }} />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
        showNewSessionButton={true}
      />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <TodayHero
          teamName={currentTeam?.name}
          todaySession={todaySession}
          nextSession={nextSession}
          onStart={(sessionId) => navigateToPage(`/training-sessions/${sessionId}/live`)}
          onOpenSession={() => navigateToPage('/training-sessions')}
          onCreateSession={() => setIsSessionModalOpen(true)}
          onAddExercises={setEditingSession}
        />

        <div className="mb-5">
          <CommandBar
            sessions={sessions}
            onCreateSession={(prefill) => { setSessionPrefill(prefill); setIsSessionModalOpen(true); }}
            onDuplicateSession={(source, date) => setDuplicateFromSession({ ...source, date })}
          />
        </div>

        <DashboardStatsGrid stats={stats} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <UpcomingSessionsCard
              sessions={upcomingSessions}
              onSessionClick={handleSessionClick}
              onViewAll={() => navigateToPage('/training-sessions')}
            />
          </div>

          <div className="space-y-5">
            <QuickActionsCard
              onCreateSession={() => setIsSessionModalOpen(true)}
              onNavigate={navigateToPage}
              onRepeatLastSession={lastCompletedSession ? handleRepeatLastSession : undefined}
            />
            <ExerciseCategoriesCard
              exercisesByCategory={exercisesByCategory}
              onCategoryClick={handleCategoryClick}
            />
            <AICoachBanner insights={insights} onOpenRecommendations={() => setIsAIModalOpen(true)} />
          </div>
        </div>

        <RecentExercisesCard
          exercises={recentExercises}
          onExerciseClick={handleExerciseClick}
          onBrowseLibrary={() => navigateToPage('/exercise-library')}
        />

        {(isSessionModalOpen || duplicateFromSession) && (
          <SessionModal
            isOpen={isSessionModalOpen || !!duplicateFromSession}
            onClose={closeSessionModal}
            duplicateFrom={duplicateFromSession}
            prefill={sessionPrefill ?? undefined}
          />
        )}

        {editingSession && (
          <SessionModal
            isOpen={true}
            onClose={closeEditingSession}
            session={editingSession}
          />
        )}

        <AIRecommendationsModal
          open={isAIModalOpen}
          onOpenChange={setIsAIModalOpen}
          insights={insights}
          onViewCategory={(category) => {
            setIsAIModalOpen(false);
            handleCategoryClick(category);
          }}
          onCreateSession={() => {
            setIsAIModalOpen(false);
            setIsSessionModalOpen(true);
          }}
        />

        <WelcomeFollowCoachesDialog />
      </main>
    </div>
  );
}
