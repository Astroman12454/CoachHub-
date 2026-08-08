import { describe, it, expect } from "vitest";
import { buildSeasonReportSummary } from "./seasonReport";
import type { PlayerDevelopment, DrillAttempt } from "@shared/schema";

function development(history: PlayerDevelopment["history"]): PlayerDevelopment {
  return { current: null, history, notes: [] };
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
  it("uses only the oldest and newest evaluation per category for first/latest/delta", () => {
    // history is newest-first, matching server/storage.ts's getPlayerDevelopment.
    const result = buildSeasonReportSummary(
      development([
        { category: "shooting", rating: 8, ratedAt: "2026-03-01T00:00:00.000Z" },
        { category: "shooting", rating: 6, ratedAt: "2026-02-01T00:00:00.000Z" },
        { category: "shooting", rating: 4, ratedAt: "2026-01-01T00:00:00.000Z" },
      ]),
      [],
    );
    expect(result.skillProgress).toEqual([{ category: "shooting", first: 4, latest: 8, delta: 4 }]);
  });

  it("only includes categories that were actually rated", () => {
    const result = buildSeasonReportSummary(
      development([{ category: "passing", rating: 5, ratedAt: "2026-01-01T00:00:00.000Z" }]),
      [],
    );
    expect(result.skillProgress).toHaveLength(1);
    expect(result.skillProgress[0].category).toBe("passing");
  });

  it("reports a zero delta (not null) when a category has only ever been rated once", () => {
    const result = buildSeasonReportSummary(
      development([{ category: "defense", rating: 7, ratedAt: "2026-01-01T00:00:00.000Z" }]),
      [],
    );
    expect(result.skillProgress[0]).toEqual({ category: "defense", first: 7, latest: 7, delta: 0 });
  });

  it("returns a null overallShooting with no drill attempts logged", () => {
    const result = buildSeasonReportSummary(development([]), []);
    expect(result.overallShooting).toBeNull();
    expect(result.topDrills).toEqual([]);
  });

  it("computes the overall shooting percentage across every drill", () => {
    const result = buildSeasonReportSummary(development([]), [
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

    const result = buildSeasonReportSummary(development([]), attempts);
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
