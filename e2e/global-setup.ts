import { chromium, type FullConfig } from "@playwright/test";
import { Pool } from "pg";
import { TEST_EMAIL, TEST_PASSWORD, AUTH_STATE_PATH } from "./helpers";

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
  } else {
    // Fresh account: no billing exists yet (that's a later step), so the
    // suite upgrades the test account directly in the DB — otherwise every
    // test that opens the create/edit exercise form would hit the
    // free-plan upgrade gate instead of the dialog it's meant to check.
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query("UPDATE accounts SET plan = 'paid' WHERE email = $1", [TEST_EMAIL]);
    await pool.end();
  }

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

  await page.context().storageState({ path: AUTH_STATE_PATH });
  await browser.close();
}
