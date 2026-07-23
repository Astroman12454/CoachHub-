import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { TrainingSession } from "@shared/schema";

interface UpcomingSessionsCardProps {
  sessions: TrainingSession[];
  onSessionClick: (sessionId: number) => void;
  onViewAll: () => void;
}

export default function UpcomingSessionsCard({ sessions, onSessionClick, onViewAll }: UpcomingSessionsCardProps) {
  return (
    <Card className="basketball-card border-0 shadow-xl slide-up">
      <CardHeader className="flex flex-row items-center justify-between bg-gradient-to-r from-white to-orange-50 dark:from-gray-900 dark:to-gray-900 rounded-t-lg">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 basketball-orange rounded-xl flex items-center justify-center">
            <i className="fas fa-calendar-week text-white"></i>
          </div>
          <CardTitle className="text-xl">Upcoming Training Sessions</CardTitle>
        </div>
        <Button
          variant="link"
          className="text-basketball-orange hover:text-basketball-orange-hover font-semibold"
          onClick={onViewAll}
        >
          View All →
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {sessions.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">No upcoming sessions scheduled</p>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-white dark:from-orange-950/20 dark:to-gray-900 rounded-xl hover:from-orange-100 hover:to-orange-50 dark:hover:from-orange-950/40 dark:hover:to-orange-950/20 transition-all duration-300 cursor-pointer border-2 border-transparent hover:border-basketball-orange transform hover:scale-102 hover:shadow-lg group"
              onClick={() => onSessionClick(session.id)}
            >
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 basketball-orange rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <i className="fas fa-basketball-ball text-white text-lg pulse-orange"></i>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-basketball-orange transition-colors">{session.name}</h4>
                  <div className="flex items-center space-x-2 mt-1">
                    <div className="flex items-center space-x-1 text-sm text-gray-500 dark:text-gray-400">
                      <i className="fas fa-calendar text-basketball-orange text-xs"></i>
                      <span>{session.date}</span>
                    </div>
                    <div className="flex items-center space-x-1 text-sm text-gray-500 dark:text-gray-400">
                      <i className="fas fa-clock text-basketball-orange text-xs"></i>
                      <span>{session.time}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center space-x-2 mb-1">
                  <div className="w-8 h-8 bg-green-100 dark:bg-green-950/40 rounded-lg flex items-center justify-center">
                    <i className="fas fa-users text-green-600 text-xs"></i>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {session.attendanceCount}/{session.totalPlayers}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-green-400 to-green-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round(((session.attendanceCount ?? 0) / (session.totalPlayers || 1)) * 100)}%` }}
                    ></div>
                  </div>
                  <span className="text-xs font-medium text-green-600">
                    {Math.round(((session.attendanceCount ?? 0) / (session.totalPlayers || 1)) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
