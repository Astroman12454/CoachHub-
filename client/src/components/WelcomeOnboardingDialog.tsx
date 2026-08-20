import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, CalendarRange, Dumbbell, PencilRuler, Target, ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { JUST_SIGNED_UP_KEY } from "@/hooks/use-auth";
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
// set by use-auth's signupMutation): add a real first player, a quick tour of
// the app's main sections, then optionally follow a coach or two before the
// new account's community feeds have anything in them. Never shown for a
// plain login, and never at all for an account created directly via the API
// rather than the signup form.
//
// The team-color picker used to be the first step here, but it's pure
// decoration with zero bearing on whether the coach can actually use the
// app — it now lives only in Settings. The audit's own suggestion replaced
// it with something better: the very first thing a new coach does is add a
// real player, not read a description of a feature — "conseguir la primera
// acción real" instead of a passive walkthrough.
//
// The tour step doesn't depend on the community having anyone to suggest,
// so — unlike the old follow-only version of this dialog — it always opens
// after a real signup; the follow step is simply skipped if there's nobody
// to recommend yet (a brand-new deployment).
export default function WelcomeOnboardingDialog() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [shouldCheck, setShouldCheck] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"addPlayer" | "tour" | "coaches">("addPlayer");
  const [tourIndex, setTourIndex] = useState(0);
  const [playerName, setPlayerName] = useState("");

  useEffect(() => {
    if (sessionStorage.getItem(JUST_SIGNED_UP_KEY)) {
      sessionStorage.removeItem(JUST_SIGNED_UP_KEY);
      setShouldCheck(true);
      setOpen(true);
      setStep("addPlayer");
      setTourIndex(0);
      setPlayerName("");
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

  // Closes the tour by sending the coach straight into their roster — either
  // showing the player they just added in the first step, or (if they
  // skipped it) landing on the same "add a player" empty state as before.
  const finishToPlayers = () => {
    handleOpenChange(false);
    setLocation("/players");
  };

  const goToTour = () => {
    setStep("tour");
    setTourIndex(0);
  };

  const addPlayerMutation = useMutation({
    mutationFn: async (name: string) => apiRequest("POST", "/api/players", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setPlayerName("");
      goToTour();
    },
    onError: (error) => {
      toast({
        title: t("welcomeOnboardingDialog.couldntAddPlayer"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const submitAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = playerName.trim();
    if (!trimmed || addPlayerMutation.isPending) return;
    addPlayerMutation.mutate(trimmed);
  };

  const goToNextTourSlide = () => {
    if (tourIndex < TOUR_SLIDES.length - 1) {
      setTourIndex((i) => i + 1);
    } else if (hasCoachesStep) {
      setStep("coaches");
    } else {
      finishToPlayers();
    }
  };

  const goToPreviousTourSlide = () => {
    if (tourIndex > 0) setTourIndex((i) => i - 1);
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

  const activeSlide = TOUR_SLIDES[tourIndex];
  const SlideIcon = activeSlide.icon;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">
            {step === "addPlayer" && t("welcomeOnboardingDialog.addPlayerTitle")}
            {step === "tour" && t(activeSlide.titleKey)}
            {step === "coaches" && t("welcomeOnboardingDialog.followTitle")}
          </DialogTitle>
          <DialogDescription>
            {step === "addPlayer" && t("welcomeOnboardingDialog.addPlayerDescription")}
            {step === "tour" && t(activeSlide.descriptionKey)}
            {step === "coaches" && t("welcomeOnboardingDialog.followDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1.5 justify-center" aria-hidden="true">
          <span className={cn("h-1.5 rounded-full transition-all", step === "addPlayer" ? "w-6 basketball-orange" : "w-1.5 bg-border")} />
          <span className={cn("h-1.5 rounded-full transition-all", step === "tour" ? "w-6 basketball-orange" : "w-1.5 bg-border")} />
          {hasCoachesStep && (
            <span className={cn("h-1.5 rounded-full transition-all", step === "coaches" ? "w-6 basketball-orange" : "w-1.5 bg-border")} />
          )}
        </div>

        {step === "addPlayer" && (
          <form onSubmit={submitAddPlayer}>
            <Input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder={t("welcomeOnboardingDialog.addPlayerPlaceholder")}
              aria-label={t("welcomeOnboardingDialog.addPlayerTitle")}
              autoFocus
              className="my-4"
              disabled={addPlayerMutation.isPending}
            />
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Button type="button" variant="ghost" onClick={goToTour} disabled={addPlayerMutation.isPending}>
                {t("welcomeOnboardingDialog.skipForNow")}
              </Button>
              <Button
                type="submit"
                className="basketball-orange basketball-orange-hover text-white"
                disabled={!playerName.trim() || addPlayerMutation.isPending}
              >
                {addPlayerMutation.isPending ? t("welcomeOnboardingDialog.adding") : t("welcomeOnboardingDialog.addAndContinue")}
              </Button>
            </div>
          </form>
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
              {tourIndex > 0 ? (
                <Button type="button" variant="ghost" onClick={goToPreviousTourSlide}>
                  <ChevronLeft className="w-4 h-4 mr-1" strokeWidth={2} aria-hidden="true" />
                  {t("welcomeOnboardingDialog.back")}
                </Button>
              ) : (
                <span />
              )}
              <Button type="button" onClick={goToNextTourSlide} className="basketball-orange basketball-orange-hover text-white">
                {tourIndex < TOUR_SLIDES.length - 1
                  ? t("welcomeOnboardingDialog.nextStep")
                  : hasCoachesStep ? t("welcomeOnboardingDialog.nextStep") : t("welcomeOnboardingDialog.goToRoster")}
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
              <Button type="button" onClick={finishToPlayers} className="basketball-orange basketball-orange-hover text-white">
                {t("welcomeOnboardingDialog.goToRoster")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
