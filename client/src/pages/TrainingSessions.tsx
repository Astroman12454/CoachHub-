import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, Pencil, Trash2, Plus, CalendarDays } from "lucide-react";
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
import type { TrainingSession } from "@shared/schema";

export default function TrainingSessions() {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingSession, setEditingSession] = useState<TrainingSession | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<TrainingSession | null>(null);

  const { data: sessions = [], isLoading, isError, refetch } = useQuery<TrainingSession[]>({
    queryKey: ['/api/training-sessions'],
  });

  const { requestDelete, isPendingDelete } = useDeleteWithUndo({
    endpoint: "/api/training-sessions",
    errorMessage: "Failed to delete training session",
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
      requestDelete(sessionToDelete.id, `"${sessionToDelete.name}" deleted.`);
      setSessionToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar
          title="Training Sessions"
          subtitle="Manage and view all your training sessions"
          showNewSessionButton={true}
          onSearch={setSearchQuery}
          searchPlaceholder="Search sessions..."
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
          title="Training Sessions"
          subtitle="Manage and view all your training sessions"
          showNewSessionButton={true}
          onSearch={setSearchQuery}
          searchPlaceholder="Search sessions..."
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
        title="Training Sessions"
        subtitle="Manage and view all your training sessions"
        showNewSessionButton={true}
        onSearch={setSearchQuery}
        searchPlaceholder="Search sessions..."
      />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        {sortedSessions.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No Training Sessions"
            description={searchQuery ? "No sessions match your search criteria." : "Get started by creating your first training session."}
            action={!searchQuery ? {
              label: "Create First Session",
              icon: Plus,
              onClick: () => setIsCreateModalOpen(true),
            } : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedSessions.map((session) => (
              <Card key={session.id} className="hover:border-basketball-orange hover:shadow-sm transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="font-display uppercase tracking-tight text-lg text-foreground mb-1">
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
                    <div className="flex items-center space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setEditingSession(session)}
                        aria-label={`Edit ${session.name}`}
                      >
                        <Pencil className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700 dark:hover:text-red-400"
                        onClick={() => setSessionToDelete(session)}
                        aria-label={`Delete ${session.name}`}
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Duration:</span>
                    <span className="font-medium tabular-nums">{session.duration} minutes</span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Attendance:</span>
                    <span className="font-medium tabular-nums">
                      {session.attendanceCount}/{session.totalPlayers} players
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Attendance Rate:</span>
                    {session.status === 'scheduled' || session.status === 'cancelled' ? (
                      <span className="text-xs text-muted-foreground">Not yet taken</span>
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

                  {session.exerciseIds && session.exerciseIds.length > 0 && (
                    <div>
                      <span className="text-sm text-muted-foreground">Exercises:</span>
                      <div className="mt-1">
                        <Badge variant="outline" className="text-xs">
                          {session.exerciseIds.length} exercise{session.exerciseIds.length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </div>
                  )}

                  {session.notes && (
                    <div>
                      <span className="text-sm text-muted-foreground">Notes:</span>
                      <p className="text-sm text-foreground mt-1 line-clamp-2">{session.notes}</p>
                    </div>
                  )}

                  <div className="pt-3 border-t border-border">
                    <Button
                      variant="outline"
                      className="w-full"
                      size="sm"
                      onClick={() => setEditingSession(session)}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
                      Edit Session
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {isCreateModalOpen && (
        <SessionModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
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
        title="Delete training session?"
        description={`This will permanently delete "${sessionToDelete?.name}". This can't be undone.`}
        onConfirm={confirmDeleteSession}
      />
    </div>
  );
}
