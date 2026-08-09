// Single source for haptic feedback — short, single pulses only. Meant for
// moments that already have a strong visual/state change (starting or
// finishing a session, marking attendance, an error), never as decoration
// on routine taps. Feature-detected and silently a no-op everywhere the
// Vibration API isn't available (desktop browsers, iOS Safari).
type HapticIntent = "tap" | "success" | "warning";

const PATTERNS: Record<HapticIntent, number | number[]> = {
  tap: 10,
  success: [10, 40, 15],
  warning: 25,
};

export function haptic(intent: HapticIntent = "tap") {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(PATTERNS[intent]);
}
