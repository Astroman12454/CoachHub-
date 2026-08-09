import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Attendance } from "@shared/schema";

// Shared between WeeklySchedule (calendar-driven attendance) and Training
// Mode (attendance taken live, mid-session) — same optimistic mutation
// either way, just a different entry point into it.
export function useSessionAttendance(sessionId: number | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const { data: attendance = [], isLoading } = useQuery<Attendance[]>({
    queryKey: ["/api/attendance/session", sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const response = await fetch(`/api/attendance/session/${sessionId}`);
      if (!response.ok) throw new Error("Failed to fetch attendance");
      return response.json();
    },
    enabled: !!sessionId,
  });

  const markAttendanceMutation = useMutation({
    mutationFn: async ({ playerId, status }: { playerId: number; status: string }) => {
      if (!sessionId) throw new Error("No session selected");
      const existing = attendance.find((a) => a.playerId === playerId);
      if (existing) {
        return apiRequest("PUT", `/api/attendance/${existing.id}`, { status });
      }
      return apiRequest("POST", "/api/attendance", { sessionId, playerId, status });
    },
    // Applies the tap immediately so the button highlights without waiting on
    // the round trip; a coach marking 15+ players in a row needs it to feel instant.
    onMutate: async ({ playerId, status }) => {
      const queryKey = ["/api/attendance/session", sessionId];
      await queryClient.cancelQueries({ queryKey });
      const previousAttendance = queryClient.getQueryData<Attendance[]>(queryKey);

      queryClient.setQueryData<Attendance[]>(queryKey, (old = []) => {
        const existingIndex = old.findIndex((a) => a.playerId === playerId);
        if (existingIndex !== -1) {
          const updated = [...old];
          updated[existingIndex] = { ...updated[existingIndex], status, markedAt: new Date() };
          return updated;
        }
        return [
          ...old,
          { id: -Date.now(), sessionId: sessionId!, playerId, status, notes: null, markedAt: new Date() },
        ];
      });

      return { previousAttendance, queryKey };
    },
    onError: (_err, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.queryKey, context.previousAttendance);
      }
      toast({
        title: t("players.error"),
        description: t("schedule.failedToUpdateAttendance"),
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/session"] });
      queryClient.invalidateQueries({ queryKey: ["/api/training-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const toggleAttendance = (playerId: number, status: string) => {
    markAttendanceMutation.mutate({ playerId, status });
  };

  // The common case is "whole team showed up" — mark everyone present in one
  // tap, then flip the one or two exceptions individually, instead of
  // tapping "present" once per player every single practice.
  const markAllPresent = (playerIds: number[]) => {
    for (const playerId of playerIds) {
      const existing = attendance.find((a) => a.playerId === playerId);
      if (existing?.status !== "present") {
        markAttendanceMutation.mutate({ playerId, status: "present" });
      }
    }
  };

  return {
    attendance,
    isLoading,
    toggleAttendance,
    markAllPresent,
    pendingPlayerId: markAttendanceMutation.isPending ? markAttendanceMutation.variables?.playerId : undefined,
  };
}
