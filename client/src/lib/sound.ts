// Short, synthesized tones (no audio assets to ship) for the two moments in
// Training Mode where a sound genuinely carries information a coach might
// miss visually — a chime, not a jingle. Off by default: enabling it is a
// deliberate action (the speaker toggle in Training Mode), never a surprise
// the first time a timer runs out. The preference persists across sessions.

const STORAGE_KEY = "coachhub.soundEnabled";

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!audioContext) audioContext = new AudioContextCtor();
  return audioContext;
}

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

export function setSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(enabled));
  // Unlocking the AudioContext needs a user gesture — this setter is only
  // ever called from a click handler (the speaker toggle), so this is that
  // gesture, resuming it once so later programmatic tones (from a timer
  // tick, with no gesture of their own) aren't silently blocked.
  if (enabled) getAudioContext()?.resume();
}

function playTone(frequencies: number[], durationMs: number) {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  frequencies.forEach((freq, i) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = freq;
    const start = now + i * (durationMs / 1000);
    const end = start + durationMs / 1000;
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(0.2, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, end);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(end);
  });
}

// A short two-note rise when an exercise's clock runs out.
export function playTimerDone() {
  playTone([660, 880], 160);
}

// A slightly longer, resolved chime for finishing the whole session.
export function playSessionFinish() {
  playTone([660, 880, 1100], 140);
}
