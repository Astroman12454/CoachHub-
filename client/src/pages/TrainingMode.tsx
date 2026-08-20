import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Play, Pause, ChevronLeft, ChevronRight, Plus, ClipboardList, StickyNote, CheckCircle2, Dumbbell, Volume2, VolumeX, Target, AlertTriangle, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import AttendanceModal from "@/components/AttendanceModal";
import RecordEvaluationResultsDialog from "@/components/RecordEvaluationResultsDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import TrainingSummaryDialog from "@/components/TrainingSummaryDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import CircularTimer from "@/components/CircularTimer";
import { useSessionAttendance } from "@/hooks/use-session-attendance";
import { useSwipe } from "@/hooks/use-swipe";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { haptic } from "@/lib/haptics";
import { useIsMobile } from "@/hooks/use-mobile";
import { isSoundEnabled, setSoundEnabled, playTimerDone, playSessionFinish } from "@/lib/sound";
import { localizedExerciseText } from "@/lib/exerciseI18n";
import { saveTrainingProgress, loadTrainingProgress, clearTrainingProgress } from "@/lib/trainingProgress";
import { cn } from "@/lib/utils";
import { CATEGORY_COLORS } from "@/lib/types";
import type { TrainingSession, Exercise, Play as PlaybookPlay, Player, PlayerInjury, EvaluationTest } from "@shared/schema";

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// The live, full-screen "run this practice" view — a coach hits "Start
// Training" and lands here instead of the normal dashboard/nav. One
// exercise on screen at a time, a countdown built from that exercise's own
// duration, and every other action (attendance, a quick note, ending
// practice) reachable without leaving this screen.
export default function TrainingMode() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ id: string }>();
  const sessionId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: session, isLoading: isLoadingSession, isError: isSessionError, refetch: refetchSession } = useQuery<TrainingSession>({
    queryKey: [`/api/training-sessions/${sessionId}`],
    enabled: !isNaN(sessionId),
  });
  const { data: exercises = [], isError: isExercisesError, refetch: refetchExercises } = useQuery<Exercise[]>({ queryKey: ["/api/exercises"] });
  const { data: plays = [], isError: isPlaysError, refetch: refetchPlays } = useQuery<PlaybookPlay[]>({ queryKey: ["/api/plays"] });
  const { data: evaluationTests = [], isError: isEvaluationTestsError, refetch: refetchEvaluationTests } = useQuery<EvaluationTest[]>({ queryKey: ["/api/evaluation-tests"] });
  const { data: players = [], isError: isPlayersError, refetch: refetchPlayers } = useQuery<Player[]>({ queryKey: ["/api/players"] });
  const { data: activeInjuries = [], isError: isInjuriesError, refetch: refetchInjuries } = useQuery<PlayerInjury[]>({ queryKey: ["/api/players/injuries"] });
  const injuredPlayerIds = useMemo(() => new Set(activeInjuries.map((i) => i.playerId)), [activeInjuries]);

  // Every one of these feeds what's on screen live, mid-practice — same
  // reasoning as isSessionError below, just extended to the session's own
  // exercises/plays/tests (the sequence itself) and the roster/injury data
  // the attendance and "watch this player" UI depends on. A silent failure
  // here would otherwise look like "this practice has no exercises" or drop
  // injury warnings without any indication something actually broke.
  const isSupportingDataError = isExercisesError || isPlaysError || isEvaluationTestsError || isPlayersError || isInjuriesError;
  const refetchSupportingData = () => {
    refetchExercises();
    refetchPlays();
    refetchEvaluationTests();
    refetchPlayers();
    refetchInjuries();
  };

  const sequence = useMemo(() => {
    if (!session?.exerciseIds) return [];
    return session.exerciseIds
      .map((id) => exercises.find((e) => e.id.toString() === id))
      .filter((e): e is Exercise => !!e);
  }, [session?.exerciseIds, exercises]);

  const practicedPlays = useMemo(() => {
    if (!session?.playIds) return [];
    return session.playIds
      .map((id) => plays.find((p) => p.id.toString() === id))
      .filter((p): p is PlaybookPlay => !!p);
  }, [session?.playIds, plays]);

  // Evaluation tests to run at the start of this session, before the
  // exercise sequence below — a coach taps one to record the roster's
  // results right there, without leaving Training Mode.
  const sessionTests = useMemo(() => {
    if (!session?.testIds) return [];
    return session.testIds
      .map((id) => evaluationTests.find((t) => t.id.toString() === id))
      .filter((t): t is EvaluationTest => !!t);
  }, [session?.testIds, evaluationTests]);

  const [stepIndex, setStepIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [recordingTest, setRecordingTest] = useState<EvaluationTest | null>(null);
  const [isFinishConfirmOpen, setIsFinishConfirmOpen] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  // A smaller timer on a phone-sized viewport claims noticeably less
  // vertical space, which matters here specifically: on a real phone (as
  // opposed to this container's max-width), the pause/skip controls below
  // the timer could otherwise land below the fold — the one thing a coach
  // mid-drill is most likely to reach for.
  const isMobile = useIsMobile();
  const [soundEnabled, setSoundEnabledState] = useState(() => isSoundEnabled());
  const startedRef = useRef(false);
  const restoredProgressRef = useRef(false);
  const pendingRestoreRef = useRef<{ stepIndex: number; secondsLeft: number } | null>(null);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setSoundEnabledState(next);
  };

  const currentExercise = sequence[stepIndex] ?? null;
  const nextExercise = sequence[stepIndex + 1] ?? null;
  const currentExerciseLocalized = currentExercise ? localizedExerciseText(currentExercise, i18n.language) : null;
  const nextExerciseLocalized = nextExercise ? localizedExerciseText(nextExercise, i18n.language) : null;
  const totalSeconds = (currentExercise?.duration ?? 0) * 60;
  const progress = totalSeconds > 0 ? secondsLeft / totalSeconds : 0;
  const isUrgent = isRunning && secondsLeft > 0 && secondsLeft <= 10;
  const reachedZeroRef = useRef(false);

  // Resets the countdown to the new step's own duration whenever the coach
  // moves to a different exercise (forward, back, or the sequence just
  // finished loading) — each exercise carries its own typical duration
  // already, so there's nothing extra to configure here. Except right after
  // a restore (below) jumps stepIndex to a saved checkpoint: that pending
  // checkpoint's secondsLeft wins instead of the exercise's full duration,
  // so reopening a paused session resumes where it left off rather than
  // resetting the clock.
  useEffect(() => {
    if (pendingRestoreRef.current && pendingRestoreRef.current.stepIndex === stepIndex) {
      setSecondsLeft(pendingRestoreRef.current.secondsLeft);
      pendingRestoreRef.current = null;
    } else {
      setSecondsLeft((currentExercise?.duration ?? 0) * 60);
    }
    reachedZeroRef.current = false;
  }, [stepIndex, currentExercise?.id]);

  // Restores a checkpoint saved the last time this session was paused (see
  // togglePause below) — once the exercise sequence is actually loaded, so
  // the restored stepIndex can be validated against its real length.
  useEffect(() => {
    if (restoredProgressRef.current || sequence.length === 0 || isNaN(sessionId)) return;
    restoredProgressRef.current = true;
    const saved = loadTrainingProgress(sessionId);
    if (!saved || saved.stepIndex >= sequence.length) return;
    pendingRestoreRef.current = saved;
    setStepIndex(saved.stepIndex);
    setIsRunning(false);
  }, [sequence.length, sessionId]);

  useEffect(() => {
    if (!isRunning || !currentExercise) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, currentExercise]);

  // One haptic buzz the moment an exercise's clock actually runs out —
  // guarded so it fires once per exercise, not on every render while it
  // sits at zero waiting for the coach to move on.
  useEffect(() => {
    if (secondsLeft === 0 && totalSeconds > 0 && !reachedZeroRef.current) {
      reachedZeroRef.current = true;
      haptic("success");
      playTimerDone();
    }
  }, [secondsLeft, totalSeconds]);

  const updateSessionMutation = useMutation({
    mutationFn: async (data: Partial<TrainingSession>) => apiRequest("PUT", `/api/training-sessions/${sessionId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/training-sessions/${sessionId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/training-sessions"] });
    },
    onError: (error) => {
      toast({ title: t("trainingMode.couldntUpdate"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    },
  });

  // "Starting" a session is just flipping its status — the coach never sees
  // or sets this directly, it just happens the moment this screen opens.
  useEffect(() => {
    if (session && session.status === "scheduled" && !startedRef.current) {
      startedRef.current = true;
      updateSessionMutation.mutate({ status: "in_progress" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status]);

  const { attendance, isLoading: attendanceLoading, toggleAttendance, markAllPresent, setAttendanceReason, pendingPlayerId } = useSessionAttendance(sessionId);

  const goToStep = (index: number) => {
    haptic("tap");
    setStepIndex(Math.max(0, Math.min(sequence.length - 1, index)));
    setIsRunning(true);
  };

  // Swipe left/right on the exercise card as a shortcut for the next/
  // previous buttons — a coach's thumb is often already resting on the
  // phone, and a swipe is faster than aiming for a specific button.
  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      if (stepIndex < sequence.length - 1) goToStep(stepIndex + 1);
    },
    onSwipeRight: () => {
      if (stepIndex > 0) goToStep(stepIndex - 1);
    },
  });

  const addSeconds = (amount: number) => {
    haptic("tap");
    setSecondsLeft((prev) => Math.max(0, prev + amount));
  };

  const togglePause = () => {
    haptic("tap");
    setIsRunning((r) => {
      // Checkpointing on the transition into paused (not every tick) is
      // the moment progress is genuinely "at rest" — resuming immediately
      // re-saves nothing until the coach pauses again.
      if (r && !isNaN(sessionId)) {
        saveTrainingProgress(sessionId, { stepIndex, secondsLeft });
      }
      return !r;
    });
  };

  const handleFinish = () => {
    haptic("success");
    playSessionFinish();
    updateSessionMutation.mutate({ status: "completed" }, {
      onSuccess: () => {
        if (!isNaN(sessionId)) clearTrainingProgress(sessionId);
        setIsSummaryOpen(true);
      },
    });
  };

  // The roster this session's attendance was actually taken against — same
  // "active players" population AttendanceModal marks all-present over.
  const activePlayers = useMemo(() => players.filter((p) => p.isActive === 1), [players]);
  const presentCount = useMemo(
    () => attendance.filter((a) => a.status === "present" || a.status === "late").length,
    [attendance]
  );

  const handleSaveNote = () => {
    const existing = session?.notes?.trim();
    const combined = existing ? `${existing}\n${noteDraft.trim()}` : noteDraft.trim();
    updateSessionMutation.mutate({ notes: combined }, {
      onSuccess: () => {
        haptic("success");
        setNoteDraft("");
        setIsNoteOpen(false);
        toast({ title: t("trainingMode.noteSaved") });
      },
    });
  };

  // A failed fetch (not just a slow one) used to leave the coach stuck on
  // the spinner below forever — isLoadingSession goes false but session
  // stays undefined, so the old `isLoadingSession || !session` check never
  // let go. Worst possible page for that: this is what's on screen live,
  // mid-practice, often on a phone with a spotty gym connection.
  if (isSessionError || isSupportingDataError) {
    return (
      <div className="min-h-screen bg-rail flex flex-col items-center justify-center gap-4 p-4 text-center">
        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-red-400" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <div>
          <p className="font-display font-semibold uppercase tracking-tight text-rail-foreground mb-1">{t("errorState.title")}</p>
          <p className="text-sm text-rail-muted max-w-sm">{t("errorState.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => { refetchSession(); refetchSupportingData(); }} className="basketball-orange basketball-orange-hover text-white">
            <RotateCw className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
            {t("errorState.tryAgain")}
          </Button>
          <Button variant="ghost" className="text-rail-foreground hover:bg-white/10" onClick={() => setLocation("/training-sessions")}>
            {t("trainingMode.exit")}
          </Button>
        </div>
      </div>
    );
  }

  if (isLoadingSession || !session) {
    // The rail is a fixed dark surface independent of the light/dark theme
    // toggle, so the shared Skeleton component (its shimmer tokens are
    // tuned per-theme, not per-surface) would render as a pale block on a
    // near-black background in light mode — bg-white/10 placeholders match
    // the muted-control treatment this screen's own header already uses.
    return (
      <div className="min-h-screen bg-rail flex flex-col court-texture" aria-hidden="true">
        {/* pt-[max(...)] reserves space under iOS's black-translucent status
            bar when this app is added to the home screen — see TopBar.tsx.
            Matters more here than most pages: this screen is deliberately
            chrome-free (no Sidebar/TopBar), so this header is the only thing
            standing between the exit/finish controls and the status bar. */}
        <header className="flex items-center justify-between gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 border-b border-rail-border">
          <div className="w-10 h-10 rounded-md bg-white/10 animate-pulse flex-shrink-0" />
          <div className="flex-1 flex flex-col items-center gap-1.5">
            <div className="h-4 w-40 rounded bg-white/10 animate-pulse" />
            <div className="h-3 w-24 rounded bg-white/10 animate-pulse" />
          </div>
          <div className="h-11 w-24 rounded-md bg-white/10 animate-pulse flex-shrink-0" />
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-3 sm:p-4 gap-6">
          <div className="w-full max-w-sm bg-white/5 rounded-lg p-5 space-y-3">
            <div className="h-5 w-2/3 rounded bg-white/10 animate-pulse" />
            <div className="h-3 w-full rounded bg-white/10 animate-pulse" />
            <div className="h-3 w-4/5 rounded bg-white/10 animate-pulse" />
          </div>
          <div className="w-36 h-36 rounded-full border-4 border-white/10 animate-pulse" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-rail text-rail-foreground flex flex-col court-texture fade-in">
      {/* Top bar — exit + progress + finish, always reachable, never buried */}
      <header className="flex items-center justify-between gap-2 p-4 border-b border-rail-border">
        <Button
          variant="ghost"
          size="icon"
          className="text-rail-foreground hover:bg-white/10 flex-shrink-0"
          onClick={() => setLocation("/training-sessions")}
          aria-label={t("trainingMode.exit")}
          title={t("trainingMode.exit")}
        >
          <X className="w-5 h-5" strokeWidth={2} aria-hidden="true" />
        </Button>
        <div className="min-w-0 text-center flex-1">
          <p className="font-display font-bold uppercase tracking-tight truncate">{session.name}</p>
          {sequence.length > 0 && (
            <p className="text-xs text-rail-muted">
              {t("trainingMode.stepProgress", { current: stepIndex + 1, total: sequence.length })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="text-rail-foreground hover:bg-white/10"
            onClick={toggleSound}
            aria-label={soundEnabled ? t("trainingMode.muteSound") : t("trainingMode.unmuteSound")}
            title={soundEnabled ? t("trainingMode.muteSound") : t("trainingMode.unmuteSound")}
          >
            {soundEnabled
              ? <Volume2 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              : <VolumeX className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
          </Button>
          <Button
            size="sm"
            className="h-11 basketball-orange basketball-orange-hover text-white"
            onClick={() => setIsFinishConfirmOpen(true)}
            disabled={updateSessionMutation.isPending}
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
            {t("trainingMode.finish")}
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-3 sm:p-4 gap-3 sm:gap-6">
        {/* Evaluation tests block — shown first, before the technical
            exercise sequence below, so the session reads as
            tests-then-technical the way it was planned in SessionModal. Not
            stepped through with a timer like exercises (a test's "duration"
            is however long recording the roster's results takes); tapping
            one just opens the same bulk results form used from the
            Evaluations page. */}
        {sessionTests.length > 0 && (
          <div className="w-full max-w-lg">
            <p className="text-xs uppercase tracking-wide text-rail-muted mb-2">{t("trainingMode.evaluationTestsToday")}</p>
            <div className="flex flex-wrap gap-2">
              {sessionTests.map((test) => (
                <button
                  key={test.id}
                  type="button"
                  onClick={() => setRecordingTest(test)}
                  className="flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 text-rail-foreground border-0 px-3 py-1.5 text-xs font-medium transition-colors"
                >
                  <Target className="w-3 h-3" strokeWidth={2} aria-hidden="true" />
                  {test.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {!currentExercise ? (
          <div className="text-center max-w-sm">
            <Dumbbell className="w-10 h-10 text-rail-muted mx-auto mb-3" strokeWidth={1.5} aria-hidden="true" />
            <h1 className="text-rail-foreground font-medium">{t("trainingMode.noExercises")}</h1>
            <p className="text-rail-muted text-sm mt-1">{t("trainingMode.noExercisesHint")}</p>
          </div>
        ) : (
          <>
            {/* Current exercise — a light card even on the dark screen, so
                category badges keep their normal (light-surface-tuned)
                contrast instead of being read directly off bg-rail. Keyed on
                the exercise id so switching exercises re-triggers the fade
                instead of silently swapping text in place. */}
            <div
              key={currentExercise.id}
              className="fade-in w-full max-w-lg bg-card text-card-foreground rounded-xl p-4 sm:p-6 shadow-2xl touch-pan-y"
              {...swipeHandlers}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <Badge className={CATEGORY_COLORS[currentExercise.category as keyof typeof CATEGORY_COLORS]}>
                  {t(`categories.exercise.${currentExercise.category}`, currentExercise.category)}
                </Badge>
                {nextExerciseLocalized && (
                  <span className="text-xs text-muted-foreground truncate">
                    {t("trainingMode.next", { name: nextExerciseLocalized.name })}
                  </span>
                )}
              </div>
              <h1 className="font-display font-bold uppercase tracking-tight text-2xl mb-2">{currentExerciseLocalized!.name}</h1>
              {currentExerciseLocalized!.description && (
                <p className="text-sm text-muted-foreground mb-2">{currentExerciseLocalized!.description}</p>
              )}
              {currentExerciseLocalized!.instructions && (
                <p className="text-sm text-muted-foreground border-t border-border pt-2 mt-2 whitespace-pre-wrap">
                  {currentExerciseLocalized!.instructions}
                </p>
              )}
            </div>

            {/* Timer — the one thing a coach glancing from across the gym
                needs to read in under a second: huge, high-contrast, with a
                ring that fills the periphery for anyone not looking dead at
                the number, and a color/pulse shift in the final 10s. */}
            <CircularTimer progress={progress} urgent={isUrgent} size={isMobile ? 200 : 252} strokeWidth={5}>
              <div
                className={cn(
                  "font-display font-bold text-5xl sm:text-7xl tabular-nums tracking-tight transition-colors",
                  isUrgent ? "text-destructive" : "text-basketball-orange"
                )}
              >
                {formatCountdown(secondsLeft)}
              </div>
            </CircularTimer>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-11 bg-transparent text-rail-foreground border-rail-border hover:bg-white/10" onClick={() => addSeconds(10)}>
                +10{t("trainingMode.secondsAbbrev")}
              </Button>
              <Button variant="outline" size="sm" className="h-11 bg-transparent text-rail-foreground border-rail-border hover:bg-white/10" onClick={() => addSeconds(30)}>
                +30{t("trainingMode.secondsAbbrev")}
              </Button>
              <Button variant="outline" size="sm" className="h-11 bg-transparent text-rail-foreground border-rail-border hover:bg-white/10" onClick={() => addSeconds(60)}>
                +1{t("trainingMode.minuteAbbrev")}
              </Button>
            </div>

            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="w-14 h-14 rounded-full bg-transparent text-rail-foreground border-rail-border hover:bg-white/10"
                onClick={() => goToStep(stepIndex - 1)}
                disabled={stepIndex === 0}
                aria-label={t("trainingMode.previous")}
              >
                <ChevronLeft className="w-6 h-6" strokeWidth={2} aria-hidden="true" />
              </Button>
              <Button
                size="icon"
                className="w-20 h-20 rounded-full basketball-orange basketball-orange-hover text-white"
                onClick={togglePause}
                aria-label={isRunning ? t("trainingMode.pause") : t("trainingMode.resume")}
              >
                {isRunning
                  ? <Pause className="w-8 h-8" strokeWidth={2} aria-hidden="true" />
                  : <Play className="w-8 h-8 ml-1" strokeWidth={2} aria-hidden="true" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="w-14 h-14 rounded-full bg-transparent text-rail-foreground border-rail-border hover:bg-white/10"
                onClick={() => goToStep(stepIndex + 1)}
                disabled={stepIndex >= sequence.length - 1}
                aria-label={t("trainingMode.nextExercise")}
              >
                <ChevronRight className="w-6 h-6" strokeWidth={2} aria-hidden="true" />
              </Button>
            </div>
          </>
        )}

        {practicedPlays.length > 0 && (
          <div className="w-full max-w-lg">
            <p className="text-xs uppercase tracking-wide text-rail-muted mb-2">{t("trainingMode.playsToday")}</p>
            <div className="flex flex-wrap gap-2">
              {practicedPlays.map((play) => (
                <Badge key={play.id} variant="secondary" className="bg-white/10 text-rail-foreground border-0">
                  {play.name}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Bottom action bar — thumb-reachable, no need to scroll or dig into
          a menu for the two things a coach reaches for mid-session. */}
      <footer>
        <div className="flex items-center gap-2 p-4 border-t border-rail-border">
          <Button
            variant="outline"
            className="flex-1 bg-transparent text-rail-foreground border-rail-border hover:bg-white/10"
            onClick={() => setIsAttendanceOpen(true)}
          >
            <ClipboardList className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
            {t("trainingMode.attendance")}
          </Button>
          <Button
            variant="outline"
            className="flex-1 bg-transparent text-rail-foreground border-rail-border hover:bg-white/10"
            onClick={() => setIsNoteOpen((open) => !open)}
          >
            <StickyNote className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
            {t("trainingMode.quickNote")}
          </Button>
        </div>

        {isNoteOpen && (
          <div className="p-4 pt-0 flex gap-2 items-end">
            <Textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder={t("trainingMode.quickNotePlaceholder")}
              rows={2}
              autoFocus
              className="bg-white/5 border-rail-border text-rail-foreground placeholder:text-rail-muted resize-none"
              aria-label={t("trainingMode.quickNote")}
            />
            <Button
              size="icon"
              className="basketball-orange basketball-orange-hover text-white flex-shrink-0"
              onClick={handleSaveNote}
              disabled={!noteDraft.trim() || updateSessionMutation.isPending}
              aria-label={t("common.save")}
            >
              <Plus className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
            </Button>
          </div>
        )}
      </footer>

      <AttendanceModal
        open={isAttendanceOpen}
        onOpenChange={setIsAttendanceOpen}
        session={session}
        players={players}
        attendance={attendance}
        isLoading={attendanceLoading}
        injuredPlayerIds={injuredPlayerIds}
        onToggleAttendance={(playerId, status) => { haptic("tap"); toggleAttendance(playerId, status); }}
        onMarkAllPresent={() => { haptic("success"); markAllPresent(players.filter((p) => p.isActive === 1).map((p) => p.id)); }}
        onSetAttendanceReason={setAttendanceReason}
        pendingPlayerId={pendingPlayerId}
      />

      <RecordEvaluationResultsDialog test={recordingTest} onOpenChange={(open) => !open && setRecordingTest(null)} />

      <ConfirmDialog
        open={isFinishConfirmOpen}
        onOpenChange={setIsFinishConfirmOpen}
        title={t("trainingMode.finishConfirmTitle")}
        description={t("trainingMode.finishConfirmDescription")}
        confirmLabel={t("trainingMode.finish")}
        isPending={updateSessionMutation.isPending}
        onConfirm={handleFinish}
      />

      <TrainingSummaryDialog
        open={isSummaryOpen}
        onDone={() => setLocation("/training-sessions")}
        sessionName={session.name}
        presentCount={presentCount}
        totalPlayers={activePlayers.length}
        exercisesCompleted={sequence.length}
        notes={session.notes ?? null}
      />
    </div>
  );
}
