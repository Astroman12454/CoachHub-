import { CalendarCheck, Users, Dumbbell, TrendingUp } from "lucide-react";
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
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard
        label="Total Sessions"
        value={stats?.totalSessions || 0}
        icon={CalendarCheck}
        color="orange"
      />
      <StatCard
        label="Active Players"
        value={stats?.activePlayersCount || 0}
        icon={Users}
        color="court"
      />
      <StatCard
        label="Exercise Library"
        value={stats?.totalExercises || 0}
        icon={Dumbbell}
        color="violet"
      />
      <StatCard
        label="Avg Attendance"
        value={`${stats?.avgAttendance || 0}%`}
        icon={TrendingUp}
        color="success"
      />
    </div>
  );
}
