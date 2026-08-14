import { chromium, type FullConfig } from "@playwright/test";
import { Pool } from "pg";
import { TEST_EMAIL, TEST_PASSWORD, AUTH_STATE_PATH } from "./helpers";
import { DEFAULT_EXERCISES } from "../server/seed";

// Runs once before the whole suite (not per test, not per worker) — signup
// or login trips the same rate limiter as a real attacker would hit, so
// doing this once and sharing the resulting session via storageState avoids
// tripping it on repeated local runs, unlike calling login() from inside
// every test ever did.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL as string;
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });

  const signupRes = await page.request.post("/api/signup", {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  if (signupRes.status() === 409) {
    await page.request.post("/api/login", {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
  }
  // No billing actually exists (that's a later step), so the suite upgrades
  // the test account directly in the DB — otherwise every test that opens
  // the create/edit exercise form would hit the free-plan upgrade gate
  // instead of the dialog it's meant to check. Run unconditionally (not
  // just on first creation) so a shared dev DB from before this plan was
  // "paid" gets migrated too. "club" rather than "paid" so the same shared
  // account also exercises the Club-only coach management page — Club is a
  // superset of Paid, so every existing paid-gated test still passes
  // unchanged.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("UPDATE accounts SET plan = 'club' WHERE email = $1", [TEST_EMAIL]);

  // Same reasoning as the plan upgrade above: this fixture account may have
  // been provisioned before the exercises table grew its *Es columns, in
  // which case its seed-copied exercises never got the Spanish translations
  // added to server/seed.ts afterward. Backfill by matching on the English
  // name (only run where name_es is still null, so this is a no-op after
  // the first time) — a targeted fix for this one shared test fixture, not
  // the kind of account-wide heuristic backfill Fase 5 deliberately skipped
  // for real coaches' libraries.
  for (const seedExercise of DEFAULT_EXERCISES) {
    if (!seedExercise.nameEs) continue;
    await pool.query(
      `UPDATE exercises SET name_es = $1, description_es = $2, instructions_es = $3
       FROM accounts WHERE exercises.account_id = accounts.id AND accounts.email = $4
       AND exercises.name = $5 AND exercises.name_es IS NULL`,
      [seedExercise.nameEs, seedExercise.descriptionEs, seedExercise.instructionsEs, TEST_EMAIL, seedExercise.name]
    );
  }
  await pool.end();

  // Idempotent: only creates data the first time, so repeat runs against a
  // database that already has it are no-ops.
  const sessionsRes = await page.request.get("/api/training-sessions");
  const sessions = await sessionsRes.json();
  if (sessions.length === 0) {
    await page.request.post("/api/training-sessions", {
      data: {
        name: "E2E Test Session",
        date: new Date().toISOString().split("T")[0],
        time: "16:00",
        duration: 90,
        exerciseIds: [],
        notes: null,
      },
    });
  }

  const playersRes = await page.request.get("/api/players");
  const players = await playersRes.json();
  if (players.length === 0) {
    await page.request.post("/api/players", {
      data: { name: "E2E Test Player", position: "Point Guard", isActive: 1 },
    });
  }
  if (players.length < 2) {
    // A second active player so the scrimmage balancer can actually
    // generate a two-team split (not just show the "not enough players"
    // state), matching the "populated dialog" a11y test pattern used
    // elsewhere in this file.
    await page.request.post("/api/players", {
      data: { name: "E2E Test Player Two", position: "Shooting Guard", isActive: 1 },
    });
  }

  const playsRes = await page.request.get("/api/plays");
  const plays = await playsRes.json();
  if (plays.length === 0) {
    await page.request.post("/api/plays", {
      data: {
        name: "E2E Test Play",
        category: "offense",
        courtType: "half",
        steps: [{ tokens: [{ id: "o1", type: "offense", label: "1", x: 50, y: 90 }], drawings: [] }],
      },
    });
  }

  const physicalTestsRes = await page.request.get("/api/physical-tests");
  const physicalTests = await physicalTestsRes.json();
  if (physicalTests.length === 0) {
    await page.request.post("/api/physical-tests", {
      data: { name: "E2E Sprint Test", unit: "seconds", lowerIsBetter: 1, description: "3 sprints across the court" },
    });
  }

  const evaluationTestsRes = await page.request.get("/api/evaluation-tests");
  const evaluationTests = await evaluationTestsRes.json();
  if (evaluationTests.length === 0) {
    await page.request.post("/api/evaluation-tests", {
      data: { name: "E2E Evaluation Sprint", type: "time", unit: "seconds", worstValue: 15, bestValue: 5, description: "3 sprints across the court, scored 1-100" },
    });
  }

  // Publishing to the community now requires a public name set — do this
  // once here rather than in every test that shares an exercise, same
  // reasoning as the rest of this file's idempotent setup.
  await page.request.put("/api/account/public-name", { data: { publicName: "E2E Test Coach" } });

  await page.context().storageState({ path: AUTH_STATE_PATH });
  await browser.close();
}
