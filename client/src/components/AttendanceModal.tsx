import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import type { TrainingSession, Player, Attendance } from "@shared/schema";

const ATTENDANCE_STATUS = {
  present: { label: "Present", color: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800/40", icon: "fas fa-check-circle" },
  absent: { label: "Absent", color: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/40", icon: "fas fa-times-circle" },
  late: { label: "Late", color: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800/40", icon: "fas fa-clock" },
  excused: { label: "Excused", color: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40", icon: "fas fa-info-circle" }
};

interface AttendanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: TrainingSession | null;
  players: Player[];
  attendance: Attendance[];
  isLoading: boolean;
  onToggleAttendance: (playerId: number, status: string) => void;
}

export default function AttendanceModal({
  open,
  onOpenChange,
  session,
  players,
  attendance,
  isLoading,
  onToggleAttendance,
}: AttendanceModalProps) {
  const getPlayerAttendance = (playerId: number) => attendance.find(a => a.playerId === playerId);

  const getAttendanceRate = () => {
    if (!session || attendance.length === 0) return 0;
    const presentCount = attendance.filter(a => a.status === 'present' || a.status === 'late').length;
    return Math.round((presentCount / attendance.length) * 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl">
            <i className="fas fa-clipboard-list text-basketball-orange"></i>
            Attendance - {session?.name}
          </DialogTitle>
          <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            <div className="flex items-center gap-4">
              <span>📅 {session?.date}</span>
              <span>🕐 {session?.time}</span>
              <span>⏱️ {session?.duration} minutes</span>
            </div>
          </div>
          {attendance.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium">Attendance Rate:</span>
                <Badge className="basketball-orange text-white">
                  {getAttendanceRate()}%
                </Badge>
              </div>
              <Progress value={getAttendanceRate()} className="h-2" />
            </div>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : (
          <div className="space-y-3 mt-6">
            {players.filter(p => p.isActive === 1).map((player) => {
              const playerAttendance = getPlayerAttendance(player.id);
              const currentStatus = playerAttendance?.status || '';

              return (
                <Card key={player.id} className="border hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center font-bold text-gray-700 dark:text-gray-300 flex-shrink-0">
                          {player.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <div className="font-semibold text-lg">{player.name}</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                            <i className="fas fa-basketball-ball text-basketball-orange"></i>
                            {player.position}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
                        {Object.entries(ATTENDANCE_STATUS).map(([status, config]) => (
                          <Button
                            key={status}
                            variant={currentStatus === status ? "default" : "outline"}
                            size="sm"
                            onClick={() => onToggleAttendance(player.id, status)}
                            className={`flex items-center justify-center gap-2 ${
                              currentStatus === status
                                ? "basketball-orange basketball-orange-hover text-white"
                                : "hover:bg-gray-50 dark:hover:bg-gray-800"
                            }`}
                          >
                            <i className={config.icon}></i>
                            {config.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {playerAttendance && (
                      <div className="mt-3 pt-3 border-t flex items-center justify-between">
                        <Badge className={ATTENDANCE_STATUS[playerAttendance.status as keyof typeof ATTENDANCE_STATUS]?.color}>
                          <i className={`${ATTENDANCE_STATUS[playerAttendance.status as keyof typeof ATTENDANCE_STATUS]?.icon} mr-1`}></i>
                          {ATTENDANCE_STATUS[playerAttendance.status as keyof typeof ATTENDANCE_STATUS]?.label}
                        </Badge>
                        {playerAttendance.markedAt && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Marked at {new Date(playerAttendance.markedAt).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-6 pt-4 border-t">
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full"
            variant="outline"
          >
            Close Attendance
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
