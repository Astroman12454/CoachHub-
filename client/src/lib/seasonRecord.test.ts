import { describe, it, expect } from "vitest";
import { computeSeasonRecord } from "./seasonRecord";
import type { Game } from "@shared/schema";

let nextId = 1;
function oneGame(overrides: Partial<Game>): Game {
  return {
    id: nextId++,
    teamId: 1,
    opponent: "Rivals",
    date: "2026-01-01",
    location: null,
    teamScore: null,
    opponentScore: null,
    notes: null,
    createdAt: null,
    ...overrides,
  };
}

describe("computeSeasonRecord", () => {
  it("returns all-null/zero stats for a team with no games at all", () => {
    const record = computeSeasonRecord([]);
    expect(record).toEqual({ wins: 0, losses: 0, ties: 0, winPct: null, avgPointDiff: null, streak: null });
  });

  it("ignores games that don't have both scores recorded yet", () => {
    const games = [
      oneGame({ date: "2026-01-01", teamScore: null, opponentScore: null }),
      oneGame({ date: "2026-01-08", teamScore: 50, opponentScore: null }),
    ];
    const record = computeSeasonRecord(games);
    expect(record).toEqual({ wins: 0, losses: 0, ties: 0, winPct: null, avgPointDiff: null, streak: null });
  });

  it("tallies wins, losses, and ties from decided games", () => {
    const games = [
      oneGame({ date: "2026-01-01", teamScore: 60, opponentScore: 50 }), // win
      oneGame({ date: "2026-01-08", teamScore: 40, opponentScore: 55 }), // loss
      oneGame({ date: "2026-01-15", teamScore: 45, opponentScore: 45 }), // tie
    ];
    const record = computeSeasonRecord(games);
    expect(record.wins).toBe(1);
    expect(record.losses).toBe(1);
    expect(record.ties).toBe(1);
  });

  it("computes win percentage as a whole-number rounded value", () => {
    const games = [
      oneGame({ date: "2026-01-01", teamScore: 60, opponentScore: 50 }),
      oneGame({ date: "2026-01-08", teamScore: 60, opponentScore: 50 }),
      oneGame({ date: "2026-01-15", teamScore: 40, opponentScore: 55 }),
    ];
    expect(computeSeasonRecord(games).winPct).toBe(67); // 2/3 rounded
  });

  it("computes the average point differential across decided games", () => {
    const games = [
      oneGame({ date: "2026-01-01", teamScore: 60, opponentScore: 50 }), // +10
      oneGame({ date: "2026-01-08", teamScore: 40, opponentScore: 50 }), // -10
      oneGame({ date: "2026-01-15", teamScore: 55, opponentScore: 50 }), // +5
    ];
    expect(computeSeasonRecord(games).avgPointDiff).toBeCloseTo(5 / 3, 5);
  });

  it("reports a current win streak from the most recent decided games", () => {
    const games = [
      oneGame({ date: "2026-01-01", teamScore: 40, opponentScore: 55 }), // loss (oldest)
      oneGame({ date: "2026-01-08", teamScore: 60, opponentScore: 50 }), // win
      oneGame({ date: "2026-01-15", teamScore: 60, opponentScore: 50 }), // win
      oneGame({ date: "2026-01-22", teamScore: 60, opponentScore: 50 }), // win (newest)
    ];
    expect(computeSeasonRecord(games).streak).toEqual({ won: true, count: 3 });
  });

  it("reports a current loss streak the same way", () => {
    const games = [
      oneGame({ date: "2026-01-01", teamScore: 60, opponentScore: 50 }), // win (oldest)
      oneGame({ date: "2026-01-08", teamScore: 40, opponentScore: 55 }), // loss (newest)
    ];
    expect(computeSeasonRecord(games).streak).toEqual({ won: false, count: 1 });
  });

  it("stops the streak at a tie, without counting the tie itself", () => {
    const games = [
      oneGame({ date: "2026-01-01", teamScore: 40, opponentScore: 55 }), // loss (oldest)
      oneGame({ date: "2026-01-08", teamScore: 45, opponentScore: 45 }), // tie
      oneGame({ date: "2026-01-15", teamScore: 60, opponentScore: 50 }), // win (newest)
    ];
    expect(computeSeasonRecord(games).streak).toEqual({ won: true, count: 1 });
  });

  it("returns a null streak when the only decided game is a tie", () => {
    const games = [oneGame({ date: "2026-01-01", teamScore: 45, opponentScore: 45 })];
    expect(computeSeasonRecord(games).streak).toBeNull();
  });
});
