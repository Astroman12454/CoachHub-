import type { PlayerEvaluationTestHistory, DrillAttempt } from "@shared/schema";
import { computeEvaluationScore } from "@shared/evaluationScore";

export interface EvaluationProgressRow {
  testId: number;
  testName: string;
  unit: string;
  first: number;
  latest: number;
  delta: number;
  firstScore: number;
  latestScore: number;
  scoreDelta: number;
}

export interface DrillSummaryRow {
  drillName: string;
  made: number;
  total: number;
  pct: number;
}

export interface SeasonReportSummary {
  evaluationProgress: EvaluationProgressRow[];
  overallShooting: { made: number; total: number; pct: number } | null;
  topDrills: DrillSummaryRow[];
}

// Pure data-shaping for the season report PDF (see exportSeasonReportPdf.ts)
// — kept separate from the jsPDF rendering so the numbers themselves are
// unit-testable without mocking a PDF library.
export function buildSeasonReportSummary(
  evaluationHistory: PlayerEvaluationTestHistory[],
  drillAttempts: DrillAttempt[],
): SeasonReportSummary {
  // Each test's results are newest-first (see server/storage.ts's
  // getEvaluationTestResultsForPlayer), so the first entry is the latest
  // result and the last entry is the oldest ("first") one.
  const evaluationProgress: EvaluationProgressRow[] = evaluationHistory.map((test) => {
    const latest = test.results[0].value;
    const first = test.results[test.results.length - 1].value;
    const latestScore = computeEvaluationScore(latest, test.worstValue, test.bestValue);
    const firstScore = computeEvaluationScore(first, test.worstValue, test.bestValue);
    return {
      testId: test.testId,
      testName: test.testName,
      unit: test.unit,
      first,
      latest,
      delta: latest - first,
      firstScore,
      latestScore,
      scoreDelta: latestScore - firstScore,
    };
  });

  const shotTotals = drillAttempts.reduce(
    (acc, a) => ({ made: acc.made + a.made, total: acc.total + 1 }),
    { made: 0, total: 0 },
  );
  const overallShooting = shotTotals.total > 0
    ? { ...shotTotals, pct: Math.round((shotTotals.made / shotTotals.total) * 100) }
    : null;

  const byDrill = new Map<string, { made: number; total: number }>();
  for (const attempt of drillAttempts) {
    const entry = byDrill.get(attempt.drillName) ?? { made: 0, total: 0 };
    entry.total++;
    if (attempt.made) entry.made++;
    byDrill.set(attempt.drillName, entry);
  }
  const topDrills = Array.from(byDrill.entries())
    .map(([drillName, { made, total }]) => ({ drillName, made, total, pct: Math.round((made / total) * 100) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return { evaluationProgress, overallShooting, topDrills };
}
