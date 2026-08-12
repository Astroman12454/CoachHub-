// A coach mid-practice sometimes has to close the tab (phone locks, a call
// comes in) — without this, reopening Training Mode for the same session
// always restarts at exercise 1 with a full clock, losing exactly where
// they were. Checkpointed on every pause (not every tick) since that's the
// moment progress is genuinely "at rest," not a value still counting down.
// Client-only by design: this is a personal recovery aid, not data the
// account needs synced or reported on.

interface TrainingProgress {
  stepIndex: number;
  secondsLeft: number;
}

function storageKey(sessionId: number): string {
  return `coachhub.trainingProgress.${sessionId}`;
}

export function saveTrainingProgress(sessionId: number, progress: TrainingProgress) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(sessionId), JSON.stringify(progress));
}

export function loadTrainingProgress(sessionId: number): TrainingProgress | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey(sessionId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" && parsed !== null &&
      Number.isInteger(parsed.stepIndex) && parsed.stepIndex >= 0 &&
      Number.isFinite(parsed.secondsLeft) && parsed.secondsLeft >= 0
    ) {
      return { stepIndex: parsed.stepIndex, secondsLeft: parsed.secondsLeft };
    }
  } catch {
    // Corrupt or hand-edited value — treat as no saved progress.
  }
  return null;
}

export function clearTrainingProgress(sessionId: number) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(sessionId));
}
