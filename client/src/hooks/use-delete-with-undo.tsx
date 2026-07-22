import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

interface UseDeleteWithUndoOptions {
  endpoint: string;
  errorMessage: string;
  extraInvalidateKeys?: string[];
  undoWindowMs?: number;
}

// Hides the item immediately and shows a toast with an "Undo" action instead
// of deleting right away; the DELETE request only fires once the undo window
// expires, so a misclick (or a change of mind) never needs a server round trip.
export function useDeleteWithUndo({
  endpoint,
  errorMessage,
  extraInvalidateKeys = [],
  undoWindowMs = 5000,
}: UseDeleteWithUndoOptions) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const clearPending = useCallback((id: number) => {
    setPendingDeleteIds(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const finalizeDelete = useCallback(async (id: number) => {
    timers.current.delete(id);
    try {
      await apiRequest("DELETE", `${endpoint}/${id}`);
      queryClient.invalidateQueries({ queryKey: [endpoint] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      for (const key of extraInvalidateKeys) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    } catch {
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      clearPending(id);
    }
  }, [endpoint, extraInvalidateKeys, queryClient, toast, errorMessage, clearPending]);

  const undoDelete = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    clearPending(id);
  }, [clearPending]);

  const requestDelete = useCallback((id: number, description: string) => {
    setPendingDeleteIds(prev => new Set(prev).add(id));
    const timer = setTimeout(() => finalizeDelete(id), undoWindowMs);
    timers.current.set(id, timer);

    toast({
      description,
      action: (
        <ToastAction altText="Deshacer" onClick={() => undoDelete(id)}>
          Deshacer
        </ToastAction>
      ),
    });
  }, [finalizeDelete, undoWindowMs, toast, undoDelete]);

  const isPendingDelete = useCallback(
    (id: number) => pendingDeleteIds.has(id),
    [pendingDeleteIds]
  );

  return { requestDelete, isPendingDelete };
}
