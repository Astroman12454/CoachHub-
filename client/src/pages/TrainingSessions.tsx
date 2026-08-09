import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Calendar, Clock, Pencil, Trash2, Plus, CalendarDays, BellRing, FileDown, Loader2, Copy, PlayCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import TopBar from "@/components/TopBar";
import SessionModal from "@/components/SessionModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteWithUndo } from "@/hooks/use-delete-with-undo";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { exportSessionPlanPdf } from "@/lib/exportSessionPdf";
import type { Exercise, Play, TrainingSession } from "@shared/schema";

export default function TrainingSessions() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingSession, setEditingSession] = useState<TrainingSession | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [duplicateFromSession, setDuplicateFromSession] = useState<TrainingSession | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<TrainingSession | null>(null);
  const [exportingSessionId, setExportingSessionId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: sessions = [], isLoading, isError, refetch } = useQuery<TrainingSession[]>({
    queryKey: ['/api/training-sessions'],
  });
  // Only needed to resolve exercise/play names into the PDF export — the
  // cards themselves just show counts, so these aren't fetched otherwise.
  const { data: exercises = [] } = useQuery<Exercise[]>({ queryKey: ["/api/exercises"] });
  const { data: plays = [] } = useQuery<Play[]>({ queryKey: ["/api/plays"] });

  const handleExportPdf = async (session: TrainingSession) => {
    setExportingSessionId(session.id);
    try {
      await exportSessionPlanPdf(session, exercises, plays);
    } catch (error) {
      toast({ title: t("sessions.couldntExportPdf"), description: t("common.tryAgain"), variant: "destructive" });
    } finally {
      setExportingSessionId(null);
    }
  };

  const { requestDelete, isPendingDelete } = useDeleteWithUndo({
    endpoint: "/api/training-sessions",
    errorMessage: t("sessions.failedToDelete"),
  });

  const notifyMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const res = await apiRequest("POST", `/api/training-sessions/${sessionId}/notify`);
      return (await res.json()) as { sent: number };
    },
    onSuccess: (data) => {
      toast({
        title: data.sent > 0 ? t("sessions.reminderSent") : t("sessions.noOneToNotify"),
        description: data.sent > 0
          ? t("sessions.notifiedCount", { count: data.sent })
          : t("sessions.noPlayersNotifications"),
      });
    },
    onError: (error) => {
      toast({
        title: t("sessions.couldntSendReminder"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  // Filter by search query, then sort by date (most recent first); sessions
  // mid-undo-window are hidden immediately rather than waiting on the server.
  const sortedSessions = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return sessions
      .filter(session => !isPendingDelete(session.id))
      .filter(session =>
        session.name.toLowerCase().includes(query) ||
        session.notes?.toLowerCase().includes(query)
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sessions, searchQuery, isPendingDelete]);

  const confirmDeleteSession = () => {
    if (sessionToDelete) {
      requestDelete(sessionToDelete.id, t("sessions.deletedToast", { name: sessionToDelete.name }));
      setSessionToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar
          title={t("nav.trainingSessions")}
          subtitle={t("sessions.subtitle")}
          showNewSessionButton={true}
          onSearch={setSearchQuery}
          searchPlaceholder={t("sessions.searchPlaceholder")}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col h-full">
        <TopBar
          title={t("nav.trainingSessions")}
          subtitle={t("sessions.subtitle")}
          showNewSessionButton={true}
          onSearch={setSearchQuery}
          searchPlaceholder={t("sessions.searchPlaceholder")}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorState onRetry={() => refetch()} />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title={t("nav.trainingSessions")}
        subtitle={t("sessions.subtitle")}
        showNewSessionButton={true}
        onSearch={setSearchQuery}
        searchPlaceholder={t("sessions.searchPlaceholder")}
      />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        {sortedSessions.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={t("sessions.emptyTitle")}
            description={searchQuery ? t("sessions.emptySearchDescription") : t("sessions.emptyDescription")}
            action={!searchQuery ? {
              label: t("sessions.createFirstSession"),
              icon: Plus,
              onClick: () => setIsCreateModalOpen(true),
            } : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedSessions.map((session) => (
              <Card key={session.id} className="hover:border-basketball-orange hover:shadow-sm transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="font-display uppercase tracking-tight text-lg text-foreground mb-1 truncate">
                        {session.name}
                      </CardTitle>
                      <div className="flex items-center text-sm text-muted-foreground gap-3">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                          {new Date(`${session.date}T00:00:00`).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                          {session.time}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 flex-shrink-0">
                      {session.status !== "completed" && session.status !== "cancelled" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => notifyMutation.mutate(session.id)}
                          disabled={notifyMutation.isPending}
                          aria-label={t("sessions.notifyPlayersAbout", { name: session.name })}
                          title={t("sessions.sendReminderTitle")}
                        >
                          <BellRing className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => handleExportPdf(session)}
                        disabled={exportingSessionId === session.id}
                        aria-label={t("sessions.exportAsPdf", { name: session.name })}
                        title={t("sessions.exportPdfTitle")}
                      >
                        {exportingSessionId === session.id
                          ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                          : <FileDown className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setDuplicateFromSession(session)}
                        aria-label={t("sessions.duplicateName", { name: session.name })}
                        title={t("sessions.duplicateTitle")}
                      >
                        <Copy className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setEditingSession(session)}
                        aria-label={t("sessions.editName", { name: session.name })}
                      >
                        <Pencil className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700 dark:hover:text-red-400"
                        onClick={() => setSessionToDelete(session)}
                        aria-label={t("sessions.deleteName", { name: session.name })}
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("sessions.duration")}:</span>
                    <span className="font-medium tabular-nums">{t("sessions.minutesValue", { count: session.duration })}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("sessions.attendance")}:</span>
                    <span className="font-medium tabular-nums">
                      {t("sessions.attendanceCount", { count: session.attendanceCount, total: session.totalPlayers })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("sessions.attendanceRate")}:</span>
                    {session.status === 'scheduled' || session.status === 'cancelled' ? (
                      <span className="text-xs text-muted-foreground">{t("sessions.notYetTaken")}</span>
                    ) : (
                      <Badge variant={
                        ((session.attendanceCount ?? 0) / (session.totalPlayers || 1)) * 100 >= 80
                          ? "default"
                          : "secondary"
                      }>
                        {Math.round(((session.attendanceCount ?? 0) / (session.totalPlayers || 1)) * 100)}%
                      </Badge>
                    )}
                  </div>

                  {((session.exerciseIds && session.exerciseIds.length > 0) || (session.playIds && session.playIds.length > 0)) && (
                    <div className="flex flex-wrap gap-1.5">
                      {session.exerciseIds && session.exerciseIds.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {t("sessions.exerciseCount", { count: session.exerciseIds.length })}
                        </Badge>
                      )}
                      {session.playIds && session.playIds.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {t("sessions.playCount", { count: session.playIds.length })}
                        </Badge>
                      )}
                    </div>
                  )}

                  {session.notes && (
                    <div>
                      <span className="text-sm text-muted-foreground">{t("sessions.notes")}:</span>
                      <p className="text-sm text-foreground mt-1 line-clamp-2">{session.notes}</p>
                    </div>
                  )}

                  <div className="pt-3 border-t border-border flex gap-2">
                    {session.status !== "completed" && session.status !== "cancelled" && (
                      <Button
                        className="flex-1"
                        size="sm"
                        onClick={() => setLocation(`/training-sessions/${session.id}/live`)}
                      >
                        <PlayCircle className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
                        {t("sessions.startSession")}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className={session.status !== "completed" && session.status !== "cancelled" ? "" : "flex-1"}
                      size="sm"
                      onClick={() => setEditingSession(session)}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
                      {t("sessions.editSession")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {(isCreateModalOpen || duplicateFromSession) && (
        <SessionModal
          isOpen={isCreateModalOpen || !!duplicateFromSession}
          onClose={() => {
            setIsCreateModalOpen(false);
            setDuplicateFromSession(null);
          }}
          duplicateFrom={duplicateFromSession}
        />
      )}

      {editingSession && (
        <SessionModal
          isOpen={!!editingSession}
          onClose={() => setEditingSession(null)}
          session={editingSession}
        />
      )}

      <ConfirmDialog
        open={!!sessionToDelete}
        onOpenChange={(open) => !open && setSessionToDelete(null)}
        title={t("sessions.deleteConfirmTitle")}
        description={t("sessions.deleteConfirmDescription", { name: sessionToDelete?.name })}
        onConfirm={confirmDeleteSession}
      />
    </div>
  );
}
