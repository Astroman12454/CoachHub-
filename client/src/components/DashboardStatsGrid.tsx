import { Card, CardContent } from "@/components/ui/card";

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
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Sessions</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{stats?.totalSessions || 0}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/40 rounded-lg flex items-center justify-center">
              <i className="fas fa-calendar-check text-blue-600 text-xl"></i>
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-green-600 font-medium">+12%</span>
            <span className="text-gray-500 dark:text-gray-400 ml-2">from last month</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Players</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{stats?.activePlayersCount || 0}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-950/40 rounded-lg flex items-center justify-center">
              <i className="fas fa-users text-orange-600 text-xl"></i>
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-green-600 font-medium">+2</span>
            <span className="text-gray-500 dark:text-gray-400 ml-2">new this week</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Exercise Library</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{stats?.totalExercises || 0}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-950/40 rounded-lg flex items-center justify-center">
              <i className="fas fa-dumbbell text-purple-600 text-xl"></i>
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-green-600 font-medium">+8</span>
            <span className="text-gray-500 dark:text-gray-400 ml-2">added this week</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Attendance</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{stats?.avgAttendance || 0}%</p>
            </div>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-950/40 rounded-lg flex items-center justify-center">
              <i className="fas fa-chart-line text-green-600 text-xl"></i>
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-green-600 font-medium">+5%</span>
            <span className="text-gray-500 dark:text-gray-400 ml-2">improvement</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
