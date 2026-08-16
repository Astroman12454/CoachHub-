import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Check, CalendarRange, Dumbbell, PencilRuler, Target, ChevronLeft } from "lucide-react";
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

// The 4 things a brand-new coach most needs to know exist — not an
// exhaustive walk through every nav item (Dashboard/Players/Games are
// self-explanatory; Training Sessions is a secondary path into Weekly
// Schedule), just the parts of the app that aren't obvious from the name
// alone or that differentiate it from a plain calendar/spreadsheet.
const TOUR_SLIDES = [
  { icon: CalendarRange, titleKey: "welcomeOnboardingDialog.tourScheduleTitle", descriptionKey: "welcomeOnboardingDialog.tourScheduleDescription" },
  { icon: Dumbbell, titleKey: "welcomeOnboardingDialog.tourExercisesTitle", descriptionKey: "welcomeOnboardingDialog.tourExercisesDescription" },
  { icon: PencilRuler, titleKey: "welcomeOnboardingDialog.tourPlaybookTitle", descriptionKey: "welcomeOnboardingDialog.tourPlaybookDescription" },
  { icon: Target, titleKey: "welcomeOnboardingDialog.tourEvaluationsTitle", descriptionKey: "welcomeOnboardingDialog.tourEvaluationsDescription" },
] as const;

// A short, one-time tutorial shown right after signup (see JUST_SIGNED_UP_KEY,
// set by use-auth's signupMutation): pick a team color, a quick tour of the
// app's main sections, then optionally follow a coach or two before the new
// account's community feeds have anything in them. Never shown for a plain
// login, and never at all for an account created directly via the API
// rather than the signup form.
//
// The color and tour steps don't depend on the community having anyone to
// suggest, so — unlike the old follow-only version of this dialog — they
// always open after a real signup; the follow step is simply skipped if
// there's nobody to recommend yet (a brand-new deployment).
export default function WelcomeOnboardingDialog() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { teams, currentTeamId } = useAuth();
  const currentTeam = teams.find((team) => team.id === currentTeamId);
  const [shouldCheck, setShouldCheck] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"color" | "tour" | "coaches">("color");
  const [tourIndex, setTourIndex] = useState(0);

  useEffect(() => {
    if (sessionStorage.getItem(JUST_SIGNED_UP_KEY)) {
      sessionStorage.removeItem(JUST_SIGNED_UP_KEY);
      setShouldCheck(true);
      setOpen(true);
      setStep("color");
      setTourIndex(0);
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

  const goToTour = () => {
    setTourIndex(0);
    setStep("tour");
  };

  const goToNextTourSlide = () => {
    if (tourIndex < TOUR_SLIDES.length - 1) {
      setTourIndex((i) => i + 1);
    } else if (hasCoachesStep) {
      setStep("coaches");
    } else {
      handleOpenChange(false);
    }
  };

  const goToPreviousTourSlide = () => {
    if (tourIndex > 0) setTourIndex((i) => i - 1);
    else setStep("color");
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
  const activeSlide = TOUR_SLIDES[tourIndex];
  const SlideIcon = activeSlide.icon;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">
            {step === "color" && t("welcomeOnboardingDialog.colorTitle")}
            {step === "tour" && t(activeSlide.titleKey)}
            {step === "coaches" && t("welcomeOnboardingDialog.followTitle")}
          </DialogTitle>
          <DialogDescription>
            {step === "color" && t("welcomeOnboardingDialog.colorDescription")}
            {step === "tour" && t(activeSlide.descriptionKey)}
            {step === "coaches" && t("welcomeOnboardingDialog.followDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1.5 justify-center" aria-hidden="true">
          <span className={cn("h-1.5 rounded-full transition-all", step === "color" ? "w-6 basketball-orange" : "w-1.5 bg-border")} />
          <span className={cn("h-1.5 rounded-full transition-all", step === "tour" ? "w-6 basketball-orange" : "w-1.5 bg-border")} />
          {hasCoachesStep && (
            <span className={cn("h-1.5 rounded-full transition-all", step === "coaches" ? "w-6 basketball-orange" : "w-1.5 bg-border")} />
          )}
        </div>

        {step === "color" && (
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
              <Button type="button" onClick={goToTour} className="basketball-orange basketball-orange-hover text-white">
                {t("welcomeOnboardingDialog.nextStep")}
              </Button>
            </div>
          </>
        )}

        {step === "tour" && (
          <>
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-16 h-16 rounded-full basketball-orange flex items-center justify-center">
                <SlideIcon className="w-7 h-7 text-white" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div className="flex items-center gap-1.5" aria-hidden="true">
                {TOUR_SLIDES.map((_, i) => (
                  <span key={i} className={cn("h-1 rounded-full transition-all", i === tourIndex ? "w-4 bg-basketball-orange" : "w-1 bg-border")} />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Button type="button" variant="ghost" onClick={goToPreviousTourSlide}>
                <ChevronLeft className="w-4 h-4 mr-1" strokeWidth={2} aria-hidden="true" />
                {t("welcomeOnboardingDialog.back")}
              </Button>
              <Button type="button" onClick={goToNextTourSlide} className="basketball-orange basketball-orange-hover text-white">
                {tourIndex < TOUR_SLIDES.length - 1
                  ? t("welcomeOnboardingDialog.nextStep")
                  : hasCoachesStep ? t("welcomeOnboardingDialog.nextStep") : t("welcomeOnboardingDialog.done")}
              </Button>
            </div>
          </>
        )}

        {step === "coaches" && (
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
