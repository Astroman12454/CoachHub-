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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <StatCard
        label="Total Sessions"
        value={stats?.totalSessions || 0}
        icon="fas fa-calendar-check"
        color="blue"
        trend={{ value: "+12%", label: "from last month" }}
      />
      <StatCard
        label="Active Players"
        value={stats?.activePlayersCount || 0}
        icon="fas fa-users"
        color="orange"
        trend={{ value: "+2", label: "new this week" }}
      />
      <StatCard
        label="Exercise Library"
        value={stats?.totalExercises || 0}
        icon="fas fa-dumbbell"
        color="purple"
        trend={{ value: "+8", label: "added this week" }}
      />
      <StatCard
        label="Avg Attendance"
        value={`${stats?.avgAttendance || 0}%`}
        icon="fas fa-chart-line"
        color="green"
        trend={{ value: "+5%", label: "improvement" }}
      />
    </div>
  );
}
