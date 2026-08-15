import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import SetPublicNameDialog from "@/components/SetPublicNameDialog";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage, extractErrorCode } from "@/lib/queryClient";
import { formatTimestamp as formatWhen } from "@/lib/time";

interface PlayComment {
  id: number;
  playId: number;
  accountId: number;
  publicName: string | null;
  body: string;
  createdAt: string | null;
  canDelete: boolean;
}

const MAX_LENGTH = 500;

interface PlayCommentsDialogProps {
  playId: number | null;
  playName: string;
  onOpenChange: (open: boolean) => void;
  onCommentCountChange?: (playId: number, delta: number) => void;
}

// Play-side twin of ExerciseCommentsDialog — same behavior (public name
// required to post, author or play owner can delete), just pointed at the
// community-plays endpoints instead of community-exercises.
export default function PlayCommentsDialog({ playId, playName, onOpenChange, onCommentCountChange }: PlayCommentsDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const open = playId !== null;

  const [draft, setDraft] = useState("");
  const [isSetNameOpen, setIsSetNameOpen] = useState(false);

  const restoreFocus = useDialogFocusReturn(open);
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      restoreFocus();
      setDraft("");
    }
    onOpenChange(next);
  };

  const queryKey = [`/api/community-plays/${playId}/comments`];
  const { data: comments = [], isLoading, isError, refetch } = useQuery<PlayComment[]>({
    queryKey,
    enabled: open,
  });

  const postCommentMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest("POST", `/api/community-plays/${playId}/comments`, { body });
      return res.json() as Promise<PlayComment>;
    },
    onSuccess: (comment) => {
      queryClient.setQueryData<PlayComment[]>(queryKey, (old = []) => [...old, comment]);
      if (playId !== null) onCommentCountChange?.(playId, 1);
      setDraft("");
    },
    onError: (error) => {
      if (extractErrorCode(error) === "PUBLIC_NAME_REQUIRED") {
        setIsSetNameOpen(true);
        return;
      }
      toast({
        title: t("exerciseCommentsDialog.couldntPost"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: number) => apiRequest("DELETE", `/api/community-plays/${playId}/comments/${commentId}`),
    onMutate: async (commentId) => {
      const previous = queryClient.getQueryData<PlayComment[]>(queryKey);
      queryClient.setQueryData<PlayComment[]>(queryKey, (old = []) => old.filter((c) => c.id !== commentId));
      return { previous };
    },
    onSuccess: () => {
      if (playId !== null) onCommentCountChange?.(playId, -1);
    },
    onError: (error, _commentId, context) => {
      if (context) queryClient.setQueryData(queryKey, context.previous);
      toast({
        title: t("exerciseCommentsDialog.couldntDelete"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || postCommentMutation.isPending) return;
    postCommentMutation.mutate(body);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-tight">{t("exerciseCommentsDialog.title")}</DialogTitle>
            <DialogDescription>{t("exerciseCommentsDialog.description", { name: playName })}</DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("exerciseCommentsDialog.empty")}</p>
          ) : (
            <ul className="space-y-3 max-h-72 overflow-y-auto">
              {comments.map((comment) => (
                <li key={comment.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">
                      {comment.publicName ?? t("notificationsDialog.someone")}
                      <span className="font-normal text-muted-foreground ml-2">{formatWhen(comment.createdAt)}</span>
                    </p>
                    <p className="text-sm text-foreground mt-0.5 break-words">{comment.body}</p>
                  </div>
                  {comment.canDelete && (
                    <button
                      type="button"
                      onClick={() => deleteCommentMutation.mutate(comment.id)}
                      className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1"
                      aria-label={t("exerciseCommentsDialog.deleteComment")}
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleSubmit} className="pt-2 border-t border-border space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
              placeholder={t("exerciseCommentsDialog.placeholder")}
              maxLength={MAX_LENGTH}
              rows={2}
              aria-label={t("exerciseCommentsDialog.placeholder")}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{draft.length}/{MAX_LENGTH}</span>
              <Button type="submit" size="sm" className="basketball-orange basketball-orange-hover text-white" disabled={!draft.trim() || postCommentMutation.isPending}>
                {t("exerciseCommentsDialog.post")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <SetPublicNameDialog
        open={isSetNameOpen}
        onOpenChange={setIsSetNameOpen}
        onSuccess={() => postCommentMutation.mutate(draft.trim())}
      />
    </>
  );
}
