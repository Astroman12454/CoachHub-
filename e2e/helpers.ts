import type { Page } from "@playwright/test";
import { Pool } from "pg";

// Fixed test account reused across the whole e2e suite so tests that assume
// existing data (a session, a player) see it — never a production account.
// Signed up once per fresh test database; falls back to logging in on
// repeat runs against a database where it already exists.
export const TEST_EMAIL = "e2e-test@coachhub.test";
export const TEST_PASSWORD = "e2e-test-password-123";

// Each Playwright worker is its own Node process, so this flag dedupes
// signup attempts within a worker (~1-2 per run instead of one per test) —
// otherwise 13 tests each POSTing /api/signup and getting a 409 back trips
// the login rate limiter, since a 409 counts as a "failed" attempt there.
let accountEnsured = false;

export async function login(page: Page) {
  if (!accountEnsured) {
    const signupRes = await page.request.post("/api/signup", {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    if (signupRes.status() === 409) {
      await page.request.post("/api/login", {
        data: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
    } else {
      // Fresh account: no billing exists yet (that's a later step), so the
      // suite upgrades the test account directly in the DB — otherwise every
      // test that opens the create/edit exercise form would hit the
      // free-plan upgrade gate instead of the dialog it's meant to check.
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      await pool.query("UPDATE accounts SET plan = 'paid' WHERE email = $1", [TEST_EMAIL]);
      await pool.end();
    }
    accountEnsured = true;
  } else {
    await page.request.post("/api/login", {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
  }

  await page.goto("/dashboard");
  await ensureTestData(page);
}

// Idempotent: only creates data the first time, so repeat runs against a
// database that already has it are no-ops.
async function ensureTestData(page: Page) {
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
}
