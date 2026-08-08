// Pure computation, no persistence — the same pattern as seasonReport.ts.
// Splits a roster into N scrimmage teams that are as evenly matched as
// possible, using each player's current skill ratings.

const DEFAULT_SCORE = 5; // neutral mid-scale score for a player with no ratings yet

export interface BalancerPlayer {
  id: number;
  name: string;
}

export interface BalancedTeam {
  players: BalancerPlayer[];
  averageScore: number;
}

export function computeOverallScore(ratings: Record<string, number> | undefined): number {
  if (!ratings) return DEFAULT_SCORE;
  const values = Object.values(ratings);
  if (values.length === 0) return DEFAULT_SCORE;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Greedy partition: sort players strongest-first, then always hand the next
// player to whichever team currently has the lowest total score. This
// converges to much better balance than a plain round-robin deal, and unlike
// a true optimal partition (NP-hard) it's instant even for a full roster.
// randomizeTies reshuffles the roster before sorting so callers can offer a
// "shuffle again" action — the sort is stable, so re-shuffling only changes
// which of several equally-rated players lands where, not the overall
// balance quality.
export function balanceTeams(
  players: BalancerPlayer[],
  ratings: Record<number, Record<string, number>>,
  numTeams: number,
  options: { randomizeTies?: boolean } = {},
): BalancedTeam[] {
  if (numTeams < 2) {
    throw new Error("numTeams must be at least 2");
  }

  const pool = options.randomizeTies ? shuffled(players) : players;
  const scored = pool
    .map((player) => ({ player, score: computeOverallScore(ratings[player.id]) }))
    .sort((a, b) => b.score - a.score);

  const teams: BalancedTeam[] = Array.from({ length: numTeams }, () => ({ players: [], averageScore: 0 }));
  const teamTotals = new Array(numTeams).fill(0);

  for (const { player, score } of scored) {
    let weakestIndex = 0;
    for (let i = 1; i < numTeams; i++) {
      if (teamTotals[i] < teamTotals[weakestIndex]) weakestIndex = i;
    }
    teams[weakestIndex].players.push(player);
    teamTotals[weakestIndex] += score;
  }

  for (let i = 0; i < numTeams; i++) {
    teams[i].averageScore = teams[i].players.length > 0 ? teamTotals[i] / teams[i].players.length : 0;
  }

  return teams;
}
