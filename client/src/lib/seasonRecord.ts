// Pure computation, no persistence — same pattern as scrimmageBalancer.ts.
// Derives a season's win-loss record, win percentage, average point
// differential, and current streak from a team's logged games. A game only
// counts once both scores are recorded — one that's scheduled but not yet
// played (or a manual entry left incomplete) contributes to none of these.
import type { Game } from "@shared/schema";

export interface SeasonStreak {
  won: boolean;
  count: number;
}

export interface SeasonRecord {
  wins: number;
  losses: number;
  ties: number;
  // null when no game has both scores recorded yet — there's nothing to
  // compute a percentage or an average from.
  winPct: number | null;
  avgPointDiff: number | null;
  streak: SeasonStreak | null;
}

type DecidedGame = Game & { teamScore: number; opponentScore: number };

function isDecided(game: Game): game is DecidedGame {
  return game.teamScore != null && game.opponentScore != null;
}

export function computeSeasonRecord(games: Game[]): SeasonRecord {
  const decided = games.filter(isDecided);

  let wins = 0, losses = 0, ties = 0;
  for (const g of decided) {
    if (g.teamScore > g.opponentScore) wins++;
    else if (g.teamScore < g.opponentScore) losses++;
    else ties++;
  }

  const winPct = decided.length > 0 ? Math.round((wins / decided.length) * 100) : null;

  const avgPointDiff = decided.length > 0
    ? decided.reduce((sum, g) => sum + (g.teamScore - g.opponentScore), 0) / decided.length
    : null;

  // Most recent unbroken run of wins (or losses), walking back from the
  // newest decided game — a tie or a switch in result ends the streak.
  const byNewest = [...decided].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const latestDecisive = byNewest.find((g) => g.teamScore !== g.opponentScore);
  let streak: SeasonStreak | null = null;
  if (latestDecisive) {
    const won = latestDecisive.teamScore > latestDecisive.opponentScore;
    let count = 0;
    for (const g of byNewest) {
      if (g.teamScore === g.opponentScore) break;
      if ((g.teamScore > g.opponentScore) !== won) break;
      count++;
    }
    streak = { won, count };
  }

  return { wins, losses, ties, winPct, avgPointDiff, streak };
}
