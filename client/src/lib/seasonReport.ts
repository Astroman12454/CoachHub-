import type { PlayerDevelopment, DrillAttempt } from "@shared/schema";
import { SKILL_CATEGORIES } from "@shared/schema";

export interface SkillProgressRow {
  category: string;
  first: number;
  latest: number;
  delta: number;
}

export interface DrillSummaryRow {
  drillName: string;
  made: number;
  total: number;
  pct: number;
}

export interface SeasonReportSummary {
  skillProgress: SkillProgressRow[];
  overallShooting: { made: number; total: number; pct: number } | null;
  topDrills: DrillSummaryRow[];
}

// Pure data-shaping for the season report PDF (see exportSeasonReportPdf.ts)
// — kept separate from the jsPDF rendering so the numbers themselves are
// unit-testable without mocking a PDF library.
export function buildSeasonReportSummary(
  development: PlayerDevelopment,
  drillAttempts: DrillAttempt[],
): SeasonReportSummary {
  // development.history is newest-first (see server/storage.ts's
  // getPlayerDevelopment), so the last row seen per category as we iterate
  // forward is the oldest — exactly the "first" rating we want.
  const latestByCategory = new Map<string, number>();
  const firstByCategory = new Map<string, number>();
  for (const row of development.history) {
    if (!latestByCategory.has(row.category)) latestByCategory.set(row.category, row.rating);
    firstByCategory.set(row.category, row.rating);
  }

  const skillProgress: SkillProgressRow[] = SKILL_CATEGORIES
    .filter((category) => latestByCategory.has(category))
    .map((category) => {
      const first = firstByCategory.get(category)!;
      const latest = latestByCategory.get(category)!;
      return { category, first, latest, delta: latest - first };
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

  return { skillProgress, overallShooting, topDrills };
}
