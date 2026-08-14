// Linear interpolation from a raw evaluation-test result to a 1-100 score.
// worstValue/bestValue (set per test by the coach) encode direction on
// their own — a timed test has worstValue > bestValue, a makes-counted one
// has worstValue < bestValue — so there's no separate "lower is better"
// flag to consult. A result outside the reference range still clamps to
// 1-100 rather than extrapolating past it.
export function computeEvaluationScore(value: number, worstValue: number, bestValue: number): number {
  const raw = 1 + ((value - worstValue) / (bestValue - worstValue)) * 99;
  return Math.round(Math.min(100, Math.max(1, raw)));
}
