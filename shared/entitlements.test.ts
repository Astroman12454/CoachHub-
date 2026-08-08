import { describe, it, expect } from "vitest";
import {
  isPaidPlan,
  isClubPlan,
  canCreateTeam,
  canCreatePlayer,
  canCreatePlay,
  canUseCustomExercises,
  canGenerateAiSessionPlan,
  canImportBoxScore,
} from "./entitlements";
import { FREE_PLAN_PLAYER_LIMIT, FREE_PLAN_TEAM_LIMIT, FREE_PLAN_PLAY_LIMIT } from "./schema";

describe("isPaidPlan", () => {
  it("is true for paid and club, false for free", () => {
    expect(isPaidPlan("paid")).toBe(true);
    expect(isPaidPlan("club")).toBe(true);
    expect(isPaidPlan("free")).toBe(false);
  });
});

describe("isClubPlan", () => {
  it("is true only for club", () => {
    expect(isClubPlan("club")).toBe(true);
    expect(isClubPlan("paid")).toBe(false);
    expect(isClubPlan("free")).toBe(false);
  });
});

describe("canCreateTeam", () => {
  it("blocks a free account at the team limit, allows below it", () => {
    expect(canCreateTeam("free", FREE_PLAN_TEAM_LIMIT - 1)).toBe(true);
    expect(canCreateTeam("free", FREE_PLAN_TEAM_LIMIT)).toBe(false);
  });

  it("never blocks a paid or club account, regardless of count", () => {
    expect(canCreateTeam("paid", FREE_PLAN_TEAM_LIMIT)).toBe(true);
    expect(canCreateTeam("paid", 999)).toBe(true);
    expect(canCreateTeam("club", 999)).toBe(true);
  });
});

describe("canCreatePlayer", () => {
  it("blocks a free account at the player limit, allows below it", () => {
    expect(canCreatePlayer("free", FREE_PLAN_PLAYER_LIMIT - 1)).toBe(true);
    expect(canCreatePlayer("free", FREE_PLAN_PLAYER_LIMIT)).toBe(false);
  });

  it("never blocks a paid account", () => {
    expect(canCreatePlayer("paid", FREE_PLAN_PLAYER_LIMIT)).toBe(true);
  });
});

describe("canCreatePlay", () => {
  it("blocks a free account at the play limit, allows below it", () => {
    expect(canCreatePlay("free", FREE_PLAN_PLAY_LIMIT - 1)).toBe(true);
    expect(canCreatePlay("free", FREE_PLAN_PLAY_LIMIT)).toBe(false);
  });

  it("never blocks a paid account", () => {
    expect(canCreatePlay("paid", FREE_PLAN_PLAY_LIMIT)).toBe(true);
  });
});

describe("plan-only feature gates", () => {
  it("canUseCustomExercises excludes only free", () => {
    expect(canUseCustomExercises("free")).toBe(false);
    expect(canUseCustomExercises("paid")).toBe(true);
    expect(canUseCustomExercises("club")).toBe(true);
  });

  it("canGenerateAiSessionPlan excludes only free", () => {
    expect(canGenerateAiSessionPlan("free")).toBe(false);
    expect(canGenerateAiSessionPlan("paid")).toBe(true);
    expect(canGenerateAiSessionPlan("club")).toBe(true);
  });

  it("canImportBoxScore excludes only free", () => {
    expect(canImportBoxScore("free")).toBe(false);
    expect(canImportBoxScore("paid")).toBe(true);
    expect(canImportBoxScore("club")).toBe(true);
  });
});
