// One-time migration: folds the old "Physical Tests" feature into
// Evaluations, which replaces it (see the "Evaluations" feature — every
// test scored automatically 1-100, physical and skill alike). Run once,
// by hand, BEFORE the physical_test* tables are dropped from the schema:
//
//   npx tsx server/scripts/migrate-physical-tests-to-evaluations.ts
//
// For every physical_tests row, creates an equivalent evaluation_tests row.
// physicalTests never had a scoring range (worstValue/bestValue), so this
// derives one from that test's actual recorded results: worst = the worst
// value ever recorded, best = the best one, oriented by lowerIsBetter. A
// test with only one distinct recorded value (or none at all) gets a
// synthetic range instead, since worstValue === bestValue is invalid (see
// insertEvaluationTestSchema's refine in shared/schema.ts).
//
// Every physical_test_results row is then copied to evaluation_test_results
// under the new test id, and any training_sessions.test_ids array entry
// pointing at an old physical-test id is remapped to the new evaluation-test
// id (dropping ids with no mapping, e.g. a test that had already been
// deleted).
//
// Does NOT migrate physical_test_likes/comments/saves — those are social
// interactions tied to the old community post, not data belonging to the
// test itself, so they're dropped along with the rest of that history
// (matching how the old 1-10 Rate Player history was fully discarded when
// Evaluations replaced it).
//
// Idempotent is NOT guaranteed — this is meant to run exactly once. Re-running
// after the physical_test* tables are dropped will simply find no rows and
// no-op.
import { pool } from "../db";

interface PhysicalTestRow {
  id: number;
  account_id: number;
  name: string;
  unit: string;
  lower_is_better: number;
  description: string | null;
  shared_to_community: number | null;
  created_at: string | null;
}

interface PhysicalTestResultRow {
  id: number;
  test_id: number;
  player_id: number;
  value: number;
  date: string;
}

async function main() {
  const testsResult = await pool.query<PhysicalTestRow>(`SELECT * FROM physical_tests ORDER BY id`);
  const tests = testsResult.rows;
  if (tests.length === 0) {
    console.log("No physical_tests rows found — nothing to migrate.");
    return;
  }

  const idMap = new Map<number, number>();
  let migratedTests = 0;
  let migratedResults = 0;

  for (const test of tests) {
    const resultsResult = await pool.query<PhysicalTestResultRow>(
      `SELECT * FROM physical_test_results WHERE test_id = $1 ORDER BY date, id`,
      [test.id],
    );
    const results = resultsResult.rows;
    const lowerIsBetter = test.lower_is_better === 1;

    let worstValue: number;
    let bestValue: number;
    if (results.length > 0) {
      const values = results.map((r) => r.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      worstValue = lowerIsBetter ? max : min;
      bestValue = lowerIsBetter ? min : max;
      if (worstValue === bestValue) {
        // Only one distinct recorded value — nudge best by 10% (or by 1 if
        // the value is 0) so the range isn't degenerate.
        const nudge = bestValue !== 0 ? Math.abs(bestValue) * 0.1 : 1;
        bestValue = lowerIsBetter ? bestValue - nudge : bestValue + nudge;
      }
    } else {
      // No results ever recorded — synthetic placeholder range; the coach
      // can edit it from the Evaluations page once they notice it.
      worstValue = lowerIsBetter ? 100 : 0;
      bestValue = lowerIsBetter ? 0 : 100;
    }

    const type = lowerIsBetter ? "time" : "count";
    const insertTest = await pool.query<{ id: number }>(
      `INSERT INTO evaluation_tests (account_id, name, type, unit, worst_value, best_value, description, shared_to_community, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        test.account_id,
        test.name,
        type,
        test.unit,
        worstValue,
        bestValue,
        test.description,
        test.shared_to_community ?? 0,
        test.created_at,
      ],
    );
    const newTestId = insertTest.rows[0].id;
    idMap.set(test.id, newTestId);
    migratedTests++;

    for (const result of results) {
      await pool.query(
        `INSERT INTO evaluation_test_results (test_id, player_id, value, date)
         VALUES ($1, $2, $3, $4)`,
        [newTestId, result.player_id, result.value, result.date],
      );
      migratedResults++;
    }
  }

  console.log(`Migrated ${migratedTests} test(s) and ${migratedResults} result(s).`);

  const sessionsResult = await pool.query<{ id: number; test_ids: string[] | null }>(
    `SELECT id, test_ids FROM training_sessions WHERE test_ids IS NOT NULL AND array_length(test_ids, 1) > 0`,
  );
  let remappedSessions = 0;
  for (const session of sessionsResult.rows) {
    const remapped = (session.test_ids ?? [])
      .map((idStr) => idMap.get(parseInt(idStr, 10)))
      .filter((id): id is number => id !== undefined)
      .map((id) => id.toString());
    await pool.query(`UPDATE training_sessions SET test_ids = $1 WHERE id = $2`, [remapped, session.id]);
    remappedSessions++;
  }
  console.log(`Remapped testIds on ${remappedSessions} training session(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
