import { describe, it, expect } from "vitest";
import { balanceTeams, type BalancerPlayer } from "./scrimmageBalancer";

function roster(count: number): BalancerPlayer[] {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `Player ${i + 1}` }));
}

describe("balanceTeams", () => {
  it("splits every player into exactly one team, with no one left out or duplicated", () => {
    const players = roster(9);
    const teams = balanceTeams(players, {}, 3);

    const assigned = teams.flatMap((t) => t.players.map((p) => p.id)).sort((a, b) => a - b);
    expect(assigned).toEqual(players.map((p) => p.id));
  });

  it("keeps team totals within one player's worth of each other for a lopsided roster", () => {
    const players = roster(6);
    const ratings: Record<number, Record<string, number>> = {
      1: { shooting: 10, dribbling: 10, defense: 10, passing: 10, conditioning: 10 },
      2: { shooting: 9, dribbling: 9, defense: 9, passing: 9, conditioning: 9 },
      3: { shooting: 1, dribbling: 1, defense: 1, passing: 1, conditioning: 1 },
      4: { shooting: 1, dribbling: 1, defense: 1, passing: 1, conditioning: 1 },
      5: { shooting: 5, dribbling: 5, defense: 5, passing: 5, conditioning: 5 },
      6: { shooting: 5, dribbling: 5, defense: 5, passing: 5, conditioning: 5 },
    };

    const [teamA, teamB] = balanceTeams(players, ratings, 2);

    // A naive alternating deal on this roster can land one team at 10+9+5=24
    // and the other at 1+1+5=7 — greedy-lowest-total keeps both teams close.
    expect(Math.abs(teamA.averageScore - teamB.averageScore)).toBeLessThan(2);
  });

  it("treats a player with no ratings as a neutral mid-scale score instead of zero", () => {
    const players = roster(2);
    const ratings: Record<number, Record<string, number>> = {
      1: { shooting: 10, dribbling: 10, defense: 10, passing: 10, conditioning: 10 },
      // player 2 has no entry at all
    };

    const teams = balanceTeams(players, ratings, 2);
    const unratedTeam = teams.find((t) => t.players.some((p) => p.id === 2))!;
    expect(unratedTeam.averageScore).toBe(5);
  });

  it("handles a roster that doesn't divide evenly across teams", () => {
    const players = roster(7);
    const teams = balanceTeams(players, {}, 3);

    const sizes = teams.map((t) => t.players.length).sort((a, b) => a - b);
    expect(sizes).toEqual([2, 2, 3]);
  });

  it("rejects fewer than two teams", () => {
    expect(() => balanceTeams(roster(4), {}, 1)).toThrow();
  });

  it("randomizeTies still produces a full, balanced split", () => {
    const players = roster(8);
    const teams = balanceTeams(players, {}, 4, { randomizeTies: true });

    const assigned = teams.flatMap((t) => t.players.map((p) => p.id)).sort((a, b) => a - b);
    expect(assigned).toEqual(players.map((p) => p.id));
    expect(teams.every((t) => t.players.length === 2)).toBe(true);
  });
});
