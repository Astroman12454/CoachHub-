import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { JUST_SIGNED_UP_KEY } from "@/hooks/use-auth";

interface SuggestedCoach {
  accountId: number;
  publicName: string;
  exerciseCount: number;
  likeCount: number;
  followerCount: number;
}

const SUGGESTED_QUERY_KEY = ["/api/coaches/suggested?limit=3"];

// A one-time nudge shown right after signup (see JUST_SIGNED_UP_KEY, set by
// use-auth's signupMutation) to follow a coach or two before the new
// account's community feeds have anything in them. Never shown for a plain
// login, and never at all if the community doesn't yet have anyone to
// suggest (a brand-new deployment, or an account created directly via the
// API rather than the signup form).
export default function WelcomeFollowCoachesDialog() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [shouldCheck, setShouldCheck] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(JUST_SIGNED_UP_KEY)) {
      sessionStorage.removeItem(JUST_SIGNED_UP_KEY);
      setShouldCheck(true);
    }
  }, []);

  const { data: suggestedCoaches = [], isSuccess } = useQuery<SuggestedCoach[]>({
    queryKey: SUGGESTED_QUERY_KEY,
    enabled: shouldCheck,
  });

  useEffect(() => {
    if (shouldCheck && isSuccess && suggestedCoaches.length > 0) setOpen(true);
  }, [shouldCheck, isSuccess, suggestedCoaches.length]);

  const restoreFocus = useDialogFocusReturn(open);
  const handleOpenChange = (next: boolean) => {
    if (!next) restoreFocus();
    setOpen(next);
  };

  const followMutation = useMutation({
    mutationFn: async (accountId: number) => apiRequest("POST", `/api/coaches/${accountId}/follow`),
    onMutate: async (accountId) => {
      await queryClient.cancelQueries({ queryKey: SUGGESTED_QUERY_KEY });
      const previous = queryClient.getQueryData<SuggestedCoach[]>(SUGGESTED_QUERY_KEY);
      queryClient.setQueryData<SuggestedCoach[]>(SUGGESTED_QUERY_KEY, (old = []) => old.filter((c) => c.accountId !== accountId));
      return { previous };
    },
    onError: (error, _accountId, context) => {
      if (context?.previous) queryClient.setQueryData(SUGGESTED_QUERY_KEY, context.previous);
      toast({
        title: t("communityExercises.couldntFollow"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">{t("welcomeFollowDialog.title")}</DialogTitle>
          <DialogDescription>{t("welcomeFollowDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {suggestedCoaches.map((coach) => (
            <div key={coach.accountId} className="flex items-center justify-between gap-3 bg-card border border-border rounded-lg p-3">
              <div className="min-w-0">
                <Link
                  href={`/coaches/${coach.accountId}`}
                  onClick={() => handleOpenChange(false)}
                  className="font-display font-semibold uppercase tracking-tight text-sm text-foreground hover:text-basketball-orange hover:underline block truncate"
                >
                  {coach.publicName}
                </Link>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("communityExercises.suggestedCoachStats", { exercises: coach.exerciseCount, likes: coach.likeCount })}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => followMutation.mutate(coach.accountId)}
                disabled={followMutation.isPending}
                aria-label={t("communityExercises.followName", { name: coach.publicName })}
              >
                <UserPlus className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
                {t("coachProfile.follow")}
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end pt-2 border-t border-border">
          <Button type="button" onClick={() => handleOpenChange(false)} className="basketball-orange basketball-orange-hover text-white">
            {t("welcomeFollowDialog.continue")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
