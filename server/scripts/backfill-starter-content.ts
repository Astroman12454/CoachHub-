// One-time convenience script: adds any DEFAULT_EXERCISES / DEFAULT_PLAYS
// (server/seed.ts) that are missing (by name) to an account's exercise
// library and its first team's playbook. Exercises are already seeded
// automatically at signup, but expanding the starter list doesn't
// retroactively reach accounts that signed up before the expansion; plays
// were never wired into signup at all (see the comment on DEFAULT_PLAYS)
// so this is the only way to add the starter playbook to an existing team.
// Idempotent — skips anything already present by name, safe to re-run.
//
//   npx tsx server/scripts/backfill-starter-content.ts [email]
//   npx tsx server/scripts/backfill-starter-content.ts --all
//
// Defaults to the e2e/demo account if no argument is given. --all backfills
// every account on the server (used after expanding DEFAULT_EXERCISES, so
// every existing coach — not just new signups — sees the bigger library).
import type { Account } from "@shared/schema";
import { storage } from "../storage";
import { DEFAULT_EXERCISES, DEFAULT_PLAYS } from "../seed";
import { EXERCISE_CATEGORIES } from "@shared/schema";

async function backfillAccount(account: Account) {
  let addedExercises = 0;
  for (const category of EXERCISE_CATEGORIES) {
    const existing = await storage.getExercisesByCategory(account.id, category);
    const existingNames = new Set(existing.map((e) => e.name));
    for (const exercise of DEFAULT_EXERCISES.filter((e) => e.category === category)) {
      if (existingNames.has(exercise.name)) continue;
      await storage.createExercise(account.id, exercise);
      addedExercises++;
    }
  }
  console.log(`Exercises: added ${addedExercises} for ${account.email}`);

  const teams = await storage.getTeamsByAccount(account.id);
  const team = teams[0];
  if (!team) {
    console.log(`No team found for ${account.email} — skipping plays.`);
    return;
  }

  const existingPlays = await storage.getAllPlays(team.id);
  const existingPlayNames = new Set(existingPlays.map((p) => p.name));
  let addedPlays = 0;
  for (const play of DEFAULT_PLAYS) {
    if (existingPlayNames.has(play.name)) continue;
    await storage.createPlayWithSteps(team.id, play);
    addedPlays++;
  }
  console.log(`Plays: added ${addedPlays} to "${team.name}" (team ${team.id})`);
}

async function main() {
  const arg = process.argv[2] ?? "e2e-test@coachhub.test";

  if (arg === "--all") {
    const accounts = await storage.getAllAccounts();
    for (const account of accounts) {
      await backfillAccount(account);
    }
    console.log(`Done — backfilled ${accounts.length} account(s).`);
    return;
  }

  const account = await storage.getAccountByEmail(arg);
  if (!account) {
    console.error(`No account found for ${arg}`);
    process.exit(1);
  }
  await backfillAccount(account);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
