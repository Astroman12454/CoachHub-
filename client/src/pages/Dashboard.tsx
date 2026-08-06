import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import TopBar from "@/components/TopBar";
import SessionModal from "@/components/SessionModal";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import DashboardStatsGrid, { type DashboardStats } from "@/components/DashboardStatsGrid";
import UpcomingSessionsCard from "@/components/UpcomingSessionsCard";
import QuickActionsCard from "@/components/QuickActionsCard";
import ExerciseCategoriesCard from "@/components/ExerciseCategoriesCard";
import AICoachBanner from "@/components/AICoachBanner";
import AIRecommendationsModal from "@/components/AIRecommendationsModal";
import RecentExercisesCard from "@/components/RecentExercisesCard";
import { computeInsights } from "@/lib/insights";
import type { Exercise, TrainingSession } from "@shared/schema";

export default function Dashboard() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);

  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useQuery<DashboardStats>({
    queryKey: ['/api/stats'],
  });

  const { data: sessions = [], isLoading: sessionsLoading, isError: sessionsError, refetch: refetchSessions } = useQuery<TrainingSession[]>({
    queryKey: ['/api/training-sessions'],
  });

  const { data: exercises = [], isLoading: exercisesLoading, isError: exercisesError, refetch: refetchExercises } = useQuery<Exercise[]>({
    queryKey: ['/api/exercises'],
  });

  // Get upcoming sessions (next 3)
  const upcomingSessions = sessions.slice(0, 3);

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

        {isSessionModalOpen && (
          <SessionModal
            isOpen={isSessionModalOpen}
            onClose={() => setIsSessionModalOpen(false)}
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
      </main>
    </div>
  );
}
