import { Layers, Users, CalendarX2, type LucideIcon } from "lucide-react";
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

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Every insight here is derived directly from the coach's own exercises and
// training-session data — no fabricated stats (no "15% more points allowed
// in the paint", no invented percentages). An insight is only included when
// there's enough real data behind it; a thin dataset simply yields fewer
// (or zero) insights rather than a placeholder number.
export function computeInsights(sessions: TrainingSession[], exercises: Exercise[]): CoachInsight[] {
  const insights: CoachInsight[] = [];

  if (exercises.length > 0) {
    const counts = EXERCISE_CATEGORIES.map(category => ({
      category,
      count: exercises.filter(e => e.category === category).length,
    }));
    const thinnest = counts.reduce((a, b) => (b.count < a.count ? b : a));
    const fullest = counts.reduce((a, b) => (b.count > a.count ? b : a));
    if (thinnest.count < fullest.count) {
      insights.push({
        id: "thin-category",
        icon: Layers,
        iconBg: "bg-blue-50 dark:bg-blue-950/40",
        iconColor: "text-blue-600",
        title: `Light on ${capitalize(thinnest.category)} Drills`,
        description: `Your library has only ${thinnest.count} ${thinnest.category} exercise${thinnest.count === 1 ? "" : "s"} — the fewest of any category. Consider adding more variety.`,
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
      title: "Attendance Trend",
      description: `Average attendance across your ${completed.length} completed session${completed.length === 1 ? "" : "s"} is ${avgRate}%.`,
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
      title: "Sessions Missing Exercises",
      description: `${missingExercises.length} upcoming session${missingExercises.length === 1 ? " has" : "s have"} no exercises assigned yet.`,
    });
  }

  return insights;
}
