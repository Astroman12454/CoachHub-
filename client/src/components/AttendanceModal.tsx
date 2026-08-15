import { useEffect, useState } from "react";
import { ClipboardList, Calendar, Clock, Timer, CheckCircle2, CheckCheck, XCircle, Clock3, Info, HeartPulse } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import DrillTrackerPanel from "@/components/DrillTrackerPanel";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { cn } from "@/lib/utils";
import type { TrainingSession, Player, Attendance } from "@shared/schema";

// Each status has two treatments: a light "tint" badge for the summary pill
// under a player's name, and a solid "selected" style for whichever button
// is currently active — distinct per status (not a uniform brand-orange for
// every selection) so a coach can read the roster's mix of present/absent/
// late/excused by color at a glance, the same way the pill already does.
// Each `selected` string overrides the Button `outline` variant's own
// hover:bg-accent/hover:text-accent-foreground, not just its resting-state
// bg/text/border — otherwise the variant's hover text color survives (it's
// a different modifier scope, so twMerge doesn't dedupe it against a plain
// `text-white`) and a hovered selected button ends up with dark text on a
// still-dark background.
const ATTENDANCE_STATUS = {
  present: {
    labelKey: "attendanceModal.present",
    color: "bg-success-tint text-success border-success",
    selected: "bg-green-700 hover:bg-green-800 text-white hover:text-white border-green-700",
    icon: CheckCircle2,
  },
  absent: {
    labelKey: "attendanceModal.absent",
    color: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/40",
    selected: "bg-red-700 hover:bg-red-800 text-white hover:text-white border-red-700",
    icon: XCircle,
  },
  late: {
    labelKey: "attendanceModal.late",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800/40",
    selected: "bg-amber-700 hover:bg-amber-800 text-white hover:text-white border-amber-700",
    icon: Clock3,
  },
  excused: {
    labelKey: "attendanceModal.excused",
    color: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40",
    selected: "bg-blue-600 hover:bg-blue-700 text-white hover:text-white border-blue-600",
    icon: Info,
  },
};

interface AttendanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: TrainingSession | null;
  players: Player[];
  attendance: Attendance[];
  isLoading: boolean;
  onToggleAttendance: (playerId: number, status: string) => void;
  /** Marks every active player present in one tap — the common case ("whole
   * team showed up") shouldn't cost one tap per player every practice. */
  onMarkAllPresent?: () => void;
  /** Sets/clears the free-text reason on a player's existing attendance
   * record (illness, travel, etc.) without changing their status. */
  onSetAttendanceReason?: (playerId: number, notes: string) => void;
  /** Player whose attendance mutation is currently in flight, if any — its
   * status buttons are disabled so a second tap before the optimistic
   * update lands can't create a duplicate attendance record. */
  pendingPlayerId?: number;
  /** Players with a currently-active injury, so the coach sees a flag right
   * where they're marking attendance. */
  injuredPlayerIds?: Set<number>;
}

export default function AttendanceModal({
  open,
  onOpenChange,
  session,
  players,
  attendance,
  isLoading,
  onToggleAttendance,
  onMarkAllPresent,
  onSetAttendanceReason,
  pendingPlayerId,
  injuredPlayerIds,
}: AttendanceModalProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<"attendance" | "drills">("attendance");
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

  useEffect(() => {
    if (open) setView("attendance");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl font-display uppercase tracking-tight">
            <ClipboardList className="w-5 h-5 text-basketball-orange" strokeWidth={1.75} aria-hidden="true" />
            {t("attendanceModal.title", { name: session?.name })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("attendanceModal.dialogDescription")}
          </DialogDescription>
          <div className="text-sm text-muted-foreground mt-2">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />{session?.date}</span>
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />{session?.time}</span>
              <span className="flex items-center gap-1.5"><Timer className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />{t("attendanceModal.durationMinutes", { count: session?.duration })}</span>
            </div>
          </div>
          {attendance.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium">{t("sessions.attendanceRate")}:</span>
                <Badge className="basketball-orange text-white">
                  {getAttendanceRate()}%
                </Badge>
              </div>
              <Progress value={getAttendanceRate()} className="h-2" aria-label={t("attendanceModal.attendanceRateAriaLabel")} />
            </div>
          )}
        </DialogHeader>

        <div className="flex gap-1 border-b border-border mt-4">
          {(["attendance", "drills"] as const).map((viewKey) => (
            <button
              key={viewKey}
              type="button"
              onClick={() => setView(viewKey)}
              className={cn(
                "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                view === viewKey
                  ? "border-basketball-orange text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {viewKey === "attendance" ? t("attendanceModal.attendanceTab") : t("attendanceModal.drillsTab")}
            </button>
          ))}
        </div>

        {view === "drills" ? (
          <DrillTrackerPanel players={players} date={session?.date ?? ""} />
        ) : isLoading ? (
          <div className="space-y-4 mt-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : (
          <div className="space-y-3 mt-6">
            {onMarkAllPresent && players.some(p => p.isActive === 1) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onMarkAllPresent}
                className="w-full sm:w-auto"
              >
                <CheckCheck className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
                {t("attendanceModal.markAllPresent")}
              </Button>
            )}
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
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-base">{player.name}</span>
                            {injuredPlayerIds?.has(player.id) && (
                              <Badge variant="destructive" className="gap-1">
                                <HeartPulse className="w-3 h-3" strokeWidth={2} aria-hidden="true" />
                                {t("playerProfile.injured")}
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">{player.position}</div>
                        </div>
                      </div>

                      {/* flex-wrap here matters: without it, these 4 buttons
                          plus a player name of any real length (and the
                          injured badge) don't fit on the sm: breakpoint's
                          row — the buttons were getting clipped by the
                          dialog edge instead of shrinking or reflowing. */}
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end sm:gap-2">
                        {Object.entries(ATTENDANCE_STATUS).map(([status, config]) => (
                          <Button
                            key={status}
                            variant="outline"
                            size="sm"
                            disabled={pendingPlayerId === player.id}
                            onClick={() => onToggleAttendance(player.id, status)}
                            className={`flex items-center justify-center gap-1.5 ${
                              currentStatus === status ? config.selected : ""
                            }`}
                          >
                            <config.icon className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                            {t(config.labelKey)}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {playerAttendance && CurrentIcon && (
                      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                        <Badge className={ATTENDANCE_STATUS[playerAttendance.status as keyof typeof ATTENDANCE_STATUS]?.color}>
                          <CurrentIcon className="w-3 h-3 mr-1" strokeWidth={1.75} aria-hidden="true" />
                          {t(ATTENDANCE_STATUS[playerAttendance.status as keyof typeof ATTENDANCE_STATUS]?.labelKey ?? "")}
                        </Badge>
                        {playerAttendance.markedAt && (
                          <span className="text-xs text-muted-foreground">
                            {t("attendanceModal.markedAt", { time: new Date(playerAttendance.markedAt).toLocaleTimeString() })}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Only offered for absent/excused — "why" only matters
                        when the player didn't show up as expected. */}
                    {onSetAttendanceReason && (currentStatus === "absent" || currentStatus === "excused") && (
                      <Input
                        key={playerAttendance?.id}
                        defaultValue={playerAttendance?.notes ?? ""}
                        onBlur={(e) => onSetAttendanceReason(player.id, e.target.value.trim())}
                        placeholder={t("attendanceModal.reasonPlaceholder")}
                        aria-label={t("attendanceModal.reasonFor", { name: player.name })}
                        className="mt-2 text-sm"
                      />
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
            {t("attendanceModal.closeAttendance")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
