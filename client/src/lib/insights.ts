import { Layers, Users, CalendarX2, type LucideIcon } from "lucide-react";
import type { TFunction } from "i18next";
import type { TrainingSession, Exercise } from "@shared/schema";
import { EXERCISE_CATEGORIES, type ExerciseCategory } from "@/lib/types";

export interface CoachInsight {
  id: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  /** Present only when there's a matching "View X Exercises" action. */
  category?: ExerciseCategory;
}

// Every insight here is derived directly from the coach's own exercises and
// training-session data — no fabricated stats (no "15% more points allowed
// in the paint", no invented percentages). An insight is only included when
// there's enough real data behind it; a thin dataset simply yields fewer
// (or zero) insights rather than a placeholder number.
export function computeInsights(sessions: TrainingSession[], exercises: Exercise[], t: TFunction): CoachInsight[] {
  const insights: CoachInsight[] = [];

  if (exercises.length > 0) {
    const counts = EXERCISE_CATEGORIES.map(category => ({
      category,
      count: exercises.filter(e => e.category === category).length,
    }));
    const thinnest = counts.reduce((a, b) => (b.count < a.count ? b : a));
    const fullest = counts.reduce((a, b) => (b.count > a.count ? b : a));
    if (thinnest.count < fullest.count) {
      const categoryLabel = t(`categories.exercise.${thinnest.category}`, thinnest.category);
      insights.push({
        id: "thin-category",
        icon: Layers,
        iconBg: "bg-blue-50 dark:bg-blue-950/40",
        iconColor: "text-blue-600",
        title: t("insights.thinCategory.title", { category: categoryLabel }),
        description: t("insights.thinCategory.description", { count: thinnest.count, category: categoryLabel }),
        category: thinnest.category,
      });
    }
  }

  const completed = sessions.filter(s => s.status === "completed");
  if (completed.length > 0) {
    const avgRate = Math.round(
      (completed.reduce((sum, s) => sum + (s.attendanceCount ?? 0) / (s.totalPlayers || 1), 0) / completed.length) * 100
    );
    insights.push({
      id: "attendance-rate",
      icon: Users,
      iconBg: "bg-success-tint",
      iconColor: "text-success",
      title: t("insights.attendanceRate.title"),
      description: t("insights.attendanceRate.description", { count: completed.length, avgRate }),
    });
  }

  const missingExercises = sessions.filter(
    s => s.status === "scheduled" && (!s.exerciseIds || s.exerciseIds.length === 0)
  );
  if (missingExercises.length > 0) {
    insights.push({
      id: "missing-exercises",
      icon: CalendarX2,
      iconBg: "bg-amber-50 dark:bg-amber-950/40",
      iconColor: "text-amber-600",
      title: t("insights.missingExercises.title"),
      description: t("insights.missingExercises.description", { count: missingExercises.length }),
    });
  }

  return insights;
}
