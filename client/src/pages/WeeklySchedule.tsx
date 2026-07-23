import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import TopBar from "@/components/TopBar";
import AttendanceModal from "@/components/AttendanceModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TrainingSession, Player, Attendance } from "@shared/schema";

const DAYS_OF_WEEK = [
  { short: "Mon", full: "Monday" },
  { short: "Tue", full: "Tuesday" },
  { short: "Wed", full: "Wednesday" },
  { short: "Thu", full: "Thursday" },
  { short: "Fri", full: "Friday" },
  { short: "Sat", full: "Saturday" },
  { short: "Sun", full: "Sunday" }
];

const STATUS_COLORS = {
  scheduled: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-800/40 dark:text-blue-300",
  in_progress: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-950/40 dark:border-orange-800/40 dark:text-orange-300",
  completed: "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/40 dark:border-green-800/40 dark:text-green-300",
  cancelled: "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200"
};

export default function WeeklySchedule() {
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);
    return monday;
  });
  const [selectedSession, setSelectedSession] = useState<TrainingSession | null>(null);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Calculate week dates
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(selectedWeek);
    date.setDate(selectedWeek.getDate() + i);
    return date;
  });

  const startDate = weekDates[0].toISOString().split('T')[0];
  const endDate = weekDates[6].toISOString().split('T')[0];

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<TrainingSession[]>({
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

  const { data: attendance = [], isLoading: attendanceLoading } = useQuery<Attendance[]>({
    queryKey: ['/api/attendance/session', selectedSession?.id],
    queryFn: async () => {
      if (!selectedSession) return [];
      const response = await fetch(`/api/attendance/session/${selectedSession.id}`);
      if (!response.ok) throw new Error('Failed to fetch attendance');
      return response.json();
    },
    enabled: !!selectedSession,
  });

  const markAttendanceMutation = useMutation({
    mutationFn: async ({ sessionId, playerId, status }: { sessionId: number; playerId: number; status: string }) => {
      const existingAttendance = attendance.find(a => a.playerId === playerId);
      if (existingAttendance) {
        return apiRequest("PUT", `/api/attendance/${existingAttendance.id}`, { status });
      } else {
        return apiRequest("POST", "/api/attendance", { sessionId, playerId, status });
      }
    },
    // Applies the tap immediately so the button highlights without waiting on
    // the round trip; a coach marking 15+ players in a row needs it to feel instant.
    onMutate: async ({ sessionId, playerId, status }) => {
      const queryKey = ['/api/attendance/session', selectedSession?.id];
      await queryClient.cancelQueries({ queryKey });
      const previousAttendance = queryClient.getQueryData<Attendance[]>(queryKey);

      queryClient.setQueryData<Attendance[]>(queryKey, (old = []) => {
        const existingIndex = old.findIndex(a => a.playerId === playerId);
        if (existingIndex !== -1) {
          const updated = [...old];
          updated[existingIndex] = { ...updated[existingIndex], status, markedAt: new Date() };
          return updated;
        }
        return [
          ...old,
          { id: -Date.now(), sessionId, playerId, status, notes: null, markedAt: new Date() },
        ];
      });

      return { previousAttendance, queryKey };
    },
    onError: (_err, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.queryKey, context.previousAttendance);
      }
      toast({
        title: "Error",
        description: "Failed to update attendance",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/attendance/session'] });
      queryClient.invalidateQueries({ queryKey: ['/api/training-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    },
  });

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

  const handleAttendanceToggle = (playerId: number, status: string) => {
    if (selectedSession) {
      markAttendanceMutation.mutate({
        sessionId: selectedSession.id,
        playerId,
        status
      });
    }
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
          title="Weekly Schedule" 
          subtitle="Plan your week and manage attendance"
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Skeleton className="h-96 w-full" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar 
        title="Weekly Schedule" 
        subtitle="Plan your training week and track attendance"
      />
      
      <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
        {/* Header with Week Navigation */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-4">
          <div className="col-span-2 text-center sm:col-span-1 sm:order-2">
            <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
              {weekDates[0].toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - {' '}
              {weekDates[6].toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm sm:text-base">Training Schedule Overview</p>
          </div>

          <Button variant="outline" onClick={() => navigateWeek('prev')} className="flex items-center justify-center gap-2 sm:order-1">
            <i className="fas fa-chevron-left"></i>
            <span className="sm:hidden">Previous</span>
            <span className="hidden sm:inline">Previous Week</span>
          </Button>

          <Button variant="outline" onClick={() => navigateWeek('next')} className="flex items-center justify-center gap-2 sm:order-3">
            <span className="sm:hidden">Next</span>
            <span className="hidden sm:inline">Next Week</span>
            <i className="fas fa-chevron-right"></i>
          </Button>
        </div>

        {/* Weekly Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-blue-900/30 border-blue-200 dark:border-blue-800/40">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-600 dark:text-blue-400 text-sm font-medium">Total Sessions</p>
                  <p className="text-2xl font-bold text-blue-800 dark:text-blue-300">{weekStats.total}</p>
                </div>
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                  <i className="fas fa-calendar-alt text-white"></i>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/40 dark:to-green-900/30 border-green-200 dark:border-green-800/40">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-600 dark:text-green-400 text-sm font-medium">Completed</p>
                  <p className="text-2xl font-bold text-green-800 dark:text-green-300">{weekStats.completed}</p>
                </div>
                <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                  <i className="fas fa-check-circle text-white"></i>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/40 dark:to-orange-900/30 border-orange-200 dark:border-orange-800/40">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-600 dark:text-orange-400 text-sm font-medium">Upcoming</p>
                  <p className="text-2xl font-bold text-orange-800 dark:text-orange-300">{weekStats.scheduled}</p>
                </div>
                <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                  <i className="fas fa-clock text-white"></i>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/40 dark:to-purple-900/30 border-purple-200 dark:border-purple-800/40">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-600 dark:text-purple-400 text-sm font-medium">Attendance</p>
                  <p className="text-2xl font-bold text-purple-800 dark:text-purple-300">{weekStats.totalAttendance}</p>
                </div>
                <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                  <i className="fas fa-users text-white"></i>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Weekly Calendar */}
        <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
          {weekDates.map((date, index) => {
            const dayInfo = DAYS_OF_WEEK[index];
            const daySessions = getSessionsForDate(date);
            const isToday = date.toDateString() === new Date().toDateString();

            return (
              <Card 
                key={index} 
                className={`min-h-48 transition-all duration-200 hover:shadow-lg ${
                  isToday ? 'ring-2 ring-basketball-orange shadow-lg' : ''
                }`}
              >
                <CardHeader className="pb-3 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800">
                  <div className="text-center">
                    <div className="font-bold text-lg text-gray-800 dark:text-gray-200">{dayInfo.short}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">{dayInfo.full}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    {isToday && (
                      <Badge className="mt-2 basketball-orange text-white">Today</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-3 space-y-2">
                  {daySessions.length === 0 ? (
                    <div className="text-center py-8">
                      <i className="fas fa-calendar-plus text-gray-300 dark:text-gray-600 text-2xl mb-2"></i>
                      <p className="text-xs text-gray-400 dark:text-gray-500">No sessions</p>
                    </div>
                  ) : (
                    daySessions.map((session) => (
                      <div 
                        key={session.id}
                        className={`rounded-lg p-3 cursor-pointer transition-all duration-200 hover:scale-105 border-2 ${
                          STATUS_COLORS[session.status as keyof typeof STATUS_COLORS] || STATUS_COLORS.scheduled
                        }`}
                        onClick={() => openAttendanceModal(session)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className="text-xs">
                            {session.time}
                          </Badge>
                          <div className="text-xs font-medium">
                            {session.duration}min
                          </div>
                        </div>
                        <div className="font-semibold text-sm truncate mb-1">
                          {session.name}
                        </div>
                        <div className="flex items-center justify-between">
                          <Badge 
                            variant="secondary" 
                            className="text-xs capitalize"
                          >
                            {session.status || 'scheduled'}
                          </Badge>
                          {session.attendanceCount !== undefined && (
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              {session.attendanceCount}/{session.totalPlayers}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
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
          onToggleAttendance={handleAttendanceToggle}
        />
      </main>
    </div>
  );
}