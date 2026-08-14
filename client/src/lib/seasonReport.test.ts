import { describe, it, expect } from "vitest";
import { buildSeasonReportSummary } from "./seasonReport";
import type { PlayerEvaluationTestHistory, DrillAttempt } from "@shared/schema";

function evalTest(overrides: Partial<PlayerEvaluationTestHistory> = {}): PlayerEvaluationTestHistory {
  return {
    testId: 1,
    testName: "Sprint",
    type: "time",
    unit: "seconds",
    worstValue: 15,
    bestValue: 5,
    results: [],
    ...overrides,
  };
}

function attempt(overrides: Partial<DrillAttempt> = {}): DrillAttempt {
  return {
    id: Math.floor(Math.random() * 100000),
    playerId: 1,
    drillName: "Free throws",
    date: "2026-01-01",
    made: 1,
    x: null,
    y: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("buildSeasonReportSummary", () => {
  it("uses only the oldest and newest result per test for first/latest/delta and scores", () => {
    // results is newest-first, matching server/storage.ts's
    // getEvaluationTestResultsForPlayer.
    const result = buildSeasonReportSummary(
      [
        evalTest({
          worstValue: 15, bestValue: 5,
          results: [
            { value: 8, date: "2026-03-01" },
            { value: 10, date: "2026-02-01" },
            { value: 12, date: "2026-01-01" },
          ],
        }),
      ],
      [],
    );
    expect(result.evaluationProgress).toEqual([{
      testId: 1, testName: "Sprint", unit: "seconds",
      first: 12, latest: 8, delta: -4,
      firstScore: 31, latestScore: 70, scoreDelta: 39,
    }]);
  });

  it("includes every test that has at least one result", () => {
    const result = buildSeasonReportSummary(
      [evalTest({ testId: 2, testName: "Free throws", results: [{ value: 7, date: "2026-01-01" }] })],
      [],
    );
    expect(result.evaluationProgress).toHaveLength(1);
    expect(result.evaluationProgress[0].testName).toBe("Free throws");
  });

  it("reports a zero delta (not null) when a test has only ever been recorded once", () => {
    const result = buildSeasonReportSummary(
      [evalTest({ worstValue: 15, bestValue: 5, results: [{ value: 10, date: "2026-01-01" }] })],
      [],
    );
    expect(result.evaluationProgress[0].delta).toBe(0);
    expect(result.evaluationProgress[0].scoreDelta).toBe(0);
  });

  it("returns a null overallShooting with no drill attempts logged", () => {
    const result = buildSeasonReportSummary([], []);
    expect(result.overallShooting).toBeNull();
    expect(result.topDrills).toEqual([]);
  });

  it("computes the overall shooting percentage across every drill", () => {
    const result = buildSeasonReportSummary([], [
      attempt({ made: 1 }),
      attempt({ made: 1 }),
      attempt({ made: 0 }),
      attempt({ made: 0 }),
    ]);
    expect(result.overallShooting).toEqual({ made: 2, total: 4, pct: 50 });
  });

  it("ranks drills by attempt volume and caps the list at 5", () => {
    const attempts: DrillAttempt[] = [];
    const drillCounts: [string, number, number][] = [
      ["Free throws", 10, 8],
      ["Layups", 8, 6],
      ["Mid-range", 6, 3],
      ["Corner threes", 4, 1],
      ["Floaters", 3, 2],
      ["Post moves", 1, 1],
    ];
    for (const [drillName, total, made] of drillCounts) {
      for (let i = 0; i < total; i++) {
        attempts.push(attempt({ drillName, made: i < made ? 1 : 0 }));
      }
    }

    const result = buildSeasonReportSummary([], attempts);
    expect(result.topDrills).toHaveLength(5);
    expect(result.topDrills.map((d) => d.drillName)).toEqual([
      "Free throws",
      "Layups",
      "Mid-range",
      "Corner threes",
      "Floaters",
    ]);
    expect(result.topDrills[0]).toEqual({ drillName: "Free throws", made: 8, total: 10, pct: 80 });
  });
});
