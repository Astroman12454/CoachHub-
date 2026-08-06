import { CalendarCheck, Users, Dumbbell, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import StatCard from "@/components/StatCard";

export interface DashboardStats {
  totalSessions: number;
  activePlayersCount: number;
  totalExercises: number;
  avgAttendance: number;
}

interface DashboardStatsGridProps {
  stats: DashboardStats | undefined;
}

export default function DashboardStatsGrid({ stats }: DashboardStatsGridProps) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard
        label={t("dashboard.totalSessions")}
        value={stats?.totalSessions || 0}
        icon={CalendarCheck}
        color="orange"
      />
      <StatCard
        label={t("dashboard.activePlayers")}
        value={stats?.activePlayersCount || 0}
        icon={Users}
        color="court"
      />
      <StatCard
        label={t("dashboard.exerciseLibrary")}
        value={stats?.totalExercises || 0}
        icon={Dumbbell}
        color="violet"
      />
      <StatCard
        label={t("dashboard.avgAttendance")}
        value={`${stats?.avgAttendance || 0}%`}
        icon={TrendingUp}
        color="success"
      />
    </div>
  );
}
