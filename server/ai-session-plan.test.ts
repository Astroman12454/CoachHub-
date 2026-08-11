// @vitest-environment node
import { describe, it, expect } from "vitest";
import { filterExercisesForPlayerCount } from "./ai-session-plan";
import type { Exercise } from "@shared/schema";

let nextId = 1;
function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: nextId++,
    accountId: 1,
    name: "Drill",
    description: "A drill",
    category: "shooting",
    duration: 10,
    difficulty: "medium",
    instructions: null,
    imageUrl: null,
    isFavorite: 0,
    shareToken: null,
    minPlayers: null,
    sharedToCommunity: 0,
    ...overrides,
  };
}

describe("filterExercisesForPlayerCount", () => {
  it("returns every exercise unchanged when playerCount is undefined", () => {
    const exercises = [exercise({ minPlayers: 10 }), exercise({ minPlayers: null })];
    expect(filterExercisesForPlayerCount(exercises, undefined)).toEqual(exercises);
  });

  it("keeps exercises with no minPlayers set regardless of the count", () => {
    const noMinimum = exercise({ minPlayers: null });
    expect(filterExercisesForPlayerCount([noMinimum], 1)).toEqual([noMinimum]);
  });

  it("keeps an exercise whose minPlayers exactly equals the attending count", () => {
    const exactFit = exercise({ minPlayers: 6 });
    expect(filterExercisesForPlayerCount([exactFit], 6)).toEqual([exactFit]);
  });

  it("keeps an exercise whose minPlayers is below the attending count", () => {
    const smallGroup = exercise({ minPlayers: 2 });
    expect(filterExercisesForPlayerCount([smallGroup], 10)).toEqual([smallGroup]);
  });

  it("drops an exercise whose minPlayers exceeds the attending count", () => {
    const tooMany = exercise({ minPlayers: 10 });
    expect(filterExercisesForPlayerCount([tooMany], 4)).toEqual([]);
  });

  it("filters a mixed list down to only the exercises that fit", () => {
    const fits = exercise({ name: "Partner passing", minPlayers: 2 });
    const alsoFits = exercise({ name: "Solo ballhandling", minPlayers: null });
    const tooMany = exercise({ name: "5-on-5 scrimmage", minPlayers: 10 });
    const result = filterExercisesForPlayerCount([fits, alsoFits, tooMany], 4);
    expect(result).toEqual([fits, alsoFits]);
  });
});
