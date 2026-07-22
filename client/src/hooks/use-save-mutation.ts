import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface UseSaveMutationOptions {
  /** REST collection endpoint, e.g. "/api/exercises". */
  endpoint: string;
  /** Id of the entity being edited. Omit to create instead of update. */
  id?: number;
  successMessage: string;
  errorMessage: string;
  successTitle?: string;
  errorTitle?: string;
  /** Query keys to invalidate in addition to `endpoint` and "/api/stats". */
  extraInvalidateKeys?: string[];
  onSuccess?: () => void;
}

/**
 * Shared shape behind every "create or edit this entity" form dialog in the
 * app (training sessions, exercises, players): POST to create, PUT to
 * `${endpoint}/${id}` to update, invalidate the relevant queries, and show a
 * success/error toast. Callers own their own copy and side effects so
 * behavior stays identical across entities that speak different languages
 * or have different post-save cleanup.
 */
export function useSaveMutation<TData>({
  endpoint,
  id,
  successMessage,
  errorMessage,
  successTitle = "Success",
  errorTitle = "Error",
  extraInvalidateKeys = [],
  onSuccess,
}: UseSaveMutationOptions) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEditing = id !== undefined;

  return useMutation({
    mutationFn: async (data: TData) => {
      return isEditing
        ? apiRequest("PUT", `${endpoint}/${id}`, data)
        : apiRequest("POST", endpoint, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [endpoint] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      for (const key of extraInvalidateKeys) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast({ title: successTitle, description: successMessage });
      onSuccess?.();
    },
    onError: () => {
      toast({ title: errorTitle, description: errorMessage, variant: "destructive" });
    },
  });
}
