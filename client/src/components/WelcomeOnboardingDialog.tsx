import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage, SESSION_QUERY_KEY } from "@/lib/queryClient";
import { JUST_SIGNED_UP_KEY, useAuth } from "@/hooks/use-auth";
import { TEAM_THEME_PRESETS, DEFAULT_ORANGE } from "@/lib/teamTheme";
import { TEAM_THEME_COLORS, type TeamThemeColor } from "@shared/schema";
import { cn } from "@/lib/utils";

interface SuggestedCoach {
  accountId: number;
  publicName: string;
  exerciseCount: number;
  likeCount: number;
  followerCount: number;
}

const SUGGESTED_QUERY_KEY = ["/api/coaches/suggested?limit=3"];

// A short, one-time tutorial shown right after signup (see JUST_SIGNED_UP_KEY,
// set by use-auth's signupMutation): pick a team color, then optionally
// follow a coach or two before the new account's community feeds have
// anything in them. Never shown for a plain login, and never at all for an
// account created directly via the API rather than the signup form.
//
// The color step doesn't depend on the community having anyone to suggest,
// so — unlike the old follow-only version of this dialog — it always opens
// after a real signup; the second step is simply skipped if there's nobody
// to recommend yet (a brand-new deployment).
export default function WelcomeOnboardingDialog() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { teams, currentTeamId } = useAuth();
  const currentTeam = teams.find((team) => team.id === currentTeamId);
  const [shouldCheck, setShouldCheck] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"color" | "coaches">("color");

  useEffect(() => {
    if (sessionStorage.getItem(JUST_SIGNED_UP_KEY)) {
      sessionStorage.removeItem(JUST_SIGNED_UP_KEY);
      setShouldCheck(true);
      setOpen(true);
      setStep("color");
    }
  }, []);

  const { data: suggestedCoaches = [] } = useQuery<SuggestedCoach[]>({
    queryKey: SUGGESTED_QUERY_KEY,
    enabled: shouldCheck,
  });
  const hasCoachesStep = suggestedCoaches.length > 0;

  const restoreFocus = useDialogFocusReturn(open);
  const handleOpenChange = (next: boolean) => {
    if (!next) restoreFocus();
    setOpen(next);
  };

  const saveColorMutation = useMutation({
    mutationFn: async (color: TeamThemeColor | null) => apiRequest("PUT", `/api/teams/${currentTeamId}`, { themeColor: color }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SESSION_QUERY_KEY] }),
    onError: (error) => {
      toast({
        title: t("welcomeOnboardingDialog.couldntSaveColor"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const goToNextStep = () => {
    if (hasCoachesStep) setStep("coaches");
    else handleOpenChange(false);
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

  const themeColor = (currentTeam?.themeColor as TeamThemeColor | null) ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">
            {step === "color" ? t("welcomeOnboardingDialog.colorTitle") : t("welcomeOnboardingDialog.followTitle")}
          </DialogTitle>
          <DialogDescription>
            {step === "color" ? t("welcomeOnboardingDialog.colorDescription") : t("welcomeOnboardingDialog.followDescription")}
          </DialogDescription>
        </DialogHeader>

        {hasCoachesStep && (
          <div className="flex items-center gap-1.5 justify-center" aria-hidden="true">
            <span className={cn("h-1.5 rounded-full transition-all", step === "color" ? "w-6 basketball-orange" : "w-1.5 bg-border")} />
            <span className={cn("h-1.5 rounded-full transition-all", step === "coaches" ? "w-6 basketball-orange" : "w-1.5 bg-border")} />
          </div>
        )}

        {step === "color" ? (
          <>
            <div className="flex items-center gap-2.5 flex-wrap justify-center py-2" role="group" aria-label={t("coachSettings.teamColor")}>
              <button
                type="button"
                onClick={() => saveColorMutation.mutate(null)}
                aria-pressed={themeColor === null}
                aria-label={t("coachSettings.defaultOrange")}
                title={t("coachSettings.defaultOrange")}
                style={{ backgroundColor: DEFAULT_ORANGE }}
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                  themeColor === null ? "border-foreground" : "border-transparent"
                )}
              >
                {themeColor === null && <Check className="w-4 h-4 text-white" strokeWidth={2.5} aria-hidden="true" />}
              </button>
              {TEAM_THEME_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => saveColorMutation.mutate(color)}
                  aria-pressed={themeColor === color}
                  aria-label={t(`coachSettings.themeColors.${color}`)}
                  title={t(`coachSettings.themeColors.${color}`)}
                  style={{ backgroundColor: TEAM_THEME_PRESETS[color].base }}
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                    themeColor === color ? "border-foreground" : "border-transparent"
                  )}
                >
                  {themeColor === color && <Check className="w-4 h-4 text-white" strokeWidth={2.5} aria-hidden="true" />}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-end pt-2 border-t border-border">
              <Button type="button" onClick={goToNextStep} className="basketball-orange basketball-orange-hover text-white">
                {hasCoachesStep ? t("welcomeOnboardingDialog.nextStep") : t("welcomeOnboardingDialog.done")}
              </Button>
            </div>
          </>
        ) : (
          <>
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
                {t("welcomeOnboardingDialog.done")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
