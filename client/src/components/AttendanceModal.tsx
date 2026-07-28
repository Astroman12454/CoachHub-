import { ClipboardList, Calendar, Clock, Timer, CheckCircle2, XCircle, Clock3, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import type { TrainingSession, Player, Attendance } from "@shared/schema";

const ATTENDANCE_STATUS = {
  present: { label: "Present", color: "bg-success-tint text-success border-success", icon: CheckCircle2 },
  absent: { label: "Absent", color: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/40", icon: XCircle },
  late: { label: "Late", color: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800/40", icon: Clock3 },
  excused: { label: "Excused", color: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40", icon: Info },
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

  const restoreFocus = useDialogFocusReturn(open);
  const handleOpenChange = (next: boolean) => {
    if (!next) restoreFocus();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl font-display uppercase tracking-tight">
            <ClipboardList className="w-5 h-5 text-basketball-orange" strokeWidth={1.75} aria-hidden="true" />
            Attendance - {session?.name}
          </DialogTitle>
          <div className="text-sm text-muted-foreground mt-2">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />{session?.date}</span>
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />{session?.time}</span>
              <span className="flex items-center gap-1.5"><Timer className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />{session?.duration} minutes</span>
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
              const CurrentIcon = playerAttendance ? ATTENDANCE_STATUS[playerAttendance.status as keyof typeof ATTENDANCE_STATUS]?.icon : null;

              return (
                <Card key={player.id} className="hover:border-basketball-orange transition-colors">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center font-display font-semibold text-foreground flex-shrink-0">
                          {player.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <div className="font-semibold text-base">{player.name}</div>
                          <div className="text-sm text-muted-foreground">{player.position}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
                        {Object.entries(ATTENDANCE_STATUS).map(([status, config]) => (
                          <Button
                            key={status}
                            variant={currentStatus === status ? "default" : "outline"}
                            size="sm"
                            onClick={() => onToggleAttendance(player.id, status)}
                            className={`flex items-center justify-center gap-1.5 ${
                              currentStatus === status
                                ? "basketball-orange basketball-orange-hover text-white"
                                : ""
                            }`}
                          >
                            <config.icon className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                            {config.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {playerAttendance && CurrentIcon && (
                      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                        <Badge className={ATTENDANCE_STATUS[playerAttendance.status as keyof typeof ATTENDANCE_STATUS]?.color}>
                          <CurrentIcon className="w-3 h-3 mr-1" strokeWidth={1.75} aria-hidden="true" />
                          {ATTENDANCE_STATUS[playerAttendance.status as keyof typeof ATTENDANCE_STATUS]?.label}
                        </Badge>
                        {playerAttendance.markedAt && (
                          <span className="text-xs text-muted-foreground">
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

        <div className="mt-6 pt-4 border-t border-border">
          <Button
            onClick={() => handleOpenChange(false)}
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
