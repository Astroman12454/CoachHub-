import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login } from "./helpers";

// axe's default ruleset (WCAG 2.0/2.1 A+AA, best-practices) — includes
// color-contrast, so this also covers the "revisión de contraste de color
// real" leg of Fase 6 without a separate tool.
async function scan(page: import("@playwright/test").Page) {
  return new AxeBuilder({ page }).analyze();
}

function summarize(violations: Awaited<ReturnType<typeof scan>>["violations"]) {
  return violations.map(v => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map(n => n.target.join(" ")),
  }));
}

test.describe("accessibility (axe)", () => {
  // The suite's shared storageState is already logged in (see
  // e2e/global-setup.ts), which would just bounce "/" straight to the
  // dashboard — these three need a genuinely logged-out context instead.
  // (This used to be a top-level "login page" test with no storageState
  // override, which meant it silently scanned the dashboard, not the
  // login page — a false positive that hid a real color-contrast bug in
  // Login.tsx's footer for who knows how long.)
  test.describe("logged out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("login page", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      const results = await scan(page);
      expect(summarize(results.violations)).toEqual([]);
    });

    test("login page — forgot password mode", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.click('button:has-text("Forgot password?")');
      await page.waitForSelector('button:has-text("Send Reset Link")');
      const results = await scan(page);
      expect(summarize(results.violations)).toEqual([]);
    });

    test("reset password page (no token)", async ({ page }) => {
      await page.goto("/reset-password");
      await page.waitForLoadState("networkidle");
      await page.waitForSelector("text=Reset Password");
      const results = await scan(page);
      expect(summarize(results.violations)).toEqual([]);
    });

    test("login page — signup mode via ?signup=1 (portal CTA deep link)", async ({ page }) => {
      await page.goto("/?signup=1");
      await page.waitForLoadState("networkidle");
      await page.waitForSelector('button:has-text("Create Account")');
      const results = await scan(page);
      expect(summarize(results.violations)).toEqual([]);
    });

    test("accept-invite page with an invalid token", async ({ page }) => {
      await page.goto("/accept-invite?token=not-a-real-token");
      await page.waitForLoadState("networkidle");
      await page.waitForSelector("text=invalid or has expired");
      const results = await scan(page);
      expect(summarize(results.violations)).toEqual([]);
    });

    test("pricing page, logged out", async ({ page }) => {
      await page.goto("/pricing");
      await page.waitForLoadState("networkidle");
      await page.waitForSelector("text=Plans & Pricing");
      // Logged out, every tier's CTA links to signup rather than checkout.
      await expect(page.locator('a[href="/?signup=1"]')).toHaveCount(3);
      const results = await scan(page);
      expect(summarize(results.violations)).toEqual([]);
    });

    test("pricing page — annual toggle switches to Club's annual price", async ({ page }) => {
      await page.goto("/pricing");
      await page.waitForLoadState("networkidle");
      await page.click('button:has-text("Annual")');
      await page.waitForSelector("text=$203.90");
      const results = await scan(page);
      expect(summarize(results.violations)).toEqual([]);
    });
  });

  test("pricing page, logged in", async ({ page }) => {
    await login(page);
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=Plans & Pricing");
    // Logged in, Paid/Club check out directly instead of linking to signup.
    await expect(page.locator('button:has-text("Upgrade to Paid")')).toBeVisible();
    await expect(page.locator('button:has-text("Upgrade to Club")')).toBeVisible();
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("dashboard", async ({ page }) => {
    await login(page);
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("dashboard — AI recommendations modal open", async ({ page }) => {
    await login(page);
    await page.click('button:has-text("View AI Recommendations")');
    await page.waitForSelector("text=AI Training Recommendations");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("training sessions", async ({ page }) => {
    await login(page);
    await page.goto("/training-sessions");
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("training sessions — create session modal open", async ({ page }) => {
    await login(page);
    await page.goto("/training-sessions");
    await page.click('button:has-text("New Session")');
    await page.waitForSelector("text=Create Training Session");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("training sessions — session timeline with exercises added", async ({ page }) => {
    await login(page);
    await page.goto("/training-sessions");
    await page.click('button:has-text("New Session")');
    await page.waitForSelector("text=Create Training Session");
    const cards = page.locator('[aria-label="Available exercises"] > div');
    const count = await cards.count();
    for (let i = 0; i < Math.min(3, count); i++) {
      await cards.nth(i).click();
    }
    await page.waitForSelector("text=Session Timeline");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("training sessions — plays to practice picker", async ({ page }) => {
    await login(page);
    await page.goto("/training-sessions");
    await page.click('button:has-text("New Session")');
    await page.waitForSelector("text=Create Training Session");
    await page.waitForSelector("text=Plays to Practice");
    await page.locator('[aria-label="Plays to practice"] button').first().click();
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("training sessions — generate with AI panel open", async ({ page }) => {
    await login(page);
    await page.goto("/training-sessions");
    await page.click('button:has-text("New Session")');
    await page.waitForSelector("text=Create Training Session");
    await page.click('button:has-text("Generate with AI")');
    await page.waitForSelector("text=Picks exercises from your own library");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("training sessions — save as template dialog open", async ({ page }) => {
    await login(page);
    await page.goto("/training-sessions");
    await page.click('button:has-text("New Session")');
    await page.waitForSelector("text=Create Training Session");
    await page.click('button:has-text("Save as Template")');
    await page.waitForSelector("text=Template Name");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("training sessions — start from template select populated", async ({ page }) => {
    await login(page);
    const templatesRes = await page.request.get("/api/session-templates");
    const templates = await templatesRes.json();
    if (templates.length === 0) {
      await page.request.post("/api/session-templates", {
        data: { name: "E2E Test Template", duration: 90, exerciseIds: [], playIds: [], notes: null },
      });
    }
    await page.goto("/training-sessions");
    await page.click('button:has-text("New Session")');
    await page.waitForSelector("text=Start from Template");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("training sessions — delete confirm dialog open", async ({ page }) => {
    await login(page);
    await page.goto("/training-sessions");
    await page.waitForLoadState("networkidle");
    await page.locator('button[aria-label^="Delete"]').first().click();
    await page.waitForSelector("text=Delete training session?");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("training sessions — duplicate session modal open", async ({ page }) => {
    await login(page);
    await page.goto("/training-sessions");
    await page.waitForLoadState("networkidle");
    await page.locator('button[aria-label^="Duplicate"]').first().click();
    await page.waitForSelector("text=Duplicate Training Session");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("training mode — live session with exercises", async ({ page }) => {
    await login(page);
    const exercisesRes = await page.request.get("/api/exercises");
    const exercises = await exercisesRes.json();
    const sessionRes = await page.request.post("/api/training-sessions", {
      data: {
        name: "E2E Training Mode Session",
        date: new Date().toISOString().split("T")[0],
        time: "17:00",
        duration: 60,
        exerciseIds: exercises.slice(0, 2).map((e: { id: number }) => e.id.toString()),
        notes: null,
      },
    });
    const session = await sessionRes.json();
    await page.goto(`/training-sessions/${session.id}/live`);
    await page.waitForSelector("text=Exercise 1 of 2");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("training mode — attendance modal open", async ({ page }) => {
    await login(page);
    const sessionsRes = await page.request.get("/api/training-sessions");
    const sessions = await sessionsRes.json();
    const today = new Date().toISOString().split("T")[0];
    const todaySession = sessions.find((s: { date: string }) => s.date === today);
    if (!todaySession) test.skip(true, "no session today to open in training mode");
    await page.goto(`/training-sessions/${todaySession.id}/live`);
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Attendance")');
    await page.waitForSelector("text=/Attendance - /");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("exercise library", async ({ page }) => {
    await login(page);
    await page.goto("/exercise-library");
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("exercise library — create exercise form open", async ({ page }) => {
    await login(page);
    await page.goto("/exercise-library");
    await page.click('button:has-text("Add Exercise")');
    await page.waitForSelector("text=Create New Exercise");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("physical tests", async ({ page }) => {
    await login(page);
    await page.goto("/physical-tests");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=E2E Sprint Test");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("physical tests — create test form open", async ({ page }) => {
    await login(page);
    await page.goto("/physical-tests");
    await page.click('button:has-text("Add Test")');
    await page.waitForSelector("text=Create New Physical Test");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("physical tests — record results dialog open", async ({ page }) => {
    await login(page);
    await page.goto("/physical-tests");
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Record Results")');
    await page.waitForSelector("text=Record Results — E2E Sprint Test");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("player profile — physical test recorded", async ({ page }) => {
    await login(page);
    await page.goto("/physical-tests");
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Record Results")');
    await page.waitForSelector("text=Record Results — E2E Sprint Test");
    await page.getByLabel("E2E Test Player", { exact: true }).fill("9.8");
    await page.click('button:has-text("Save Results")');
    await page.waitForSelector("text=Results saved");

    await page.goto("/players");
    await page.waitForLoadState("networkidle");
    await page.locator('[role="button"][aria-label="View E2E Test Player\'s profile"]').click();
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=E2E Sprint Test");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("players", async ({ page }) => {
    await login(page);
    await page.goto("/players");
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("players — create player form open", async ({ page }) => {
    await login(page);
    await page.goto("/players");
    await page.click('button:has-text("Add Player")');
    await page.waitForSelector("text=Add New Player");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("players — portal link dialog open", async ({ page }) => {
    await login(page);
    await page.goto("/players");
    await page.waitForLoadState("networkidle");
    await page.locator('button[aria-label^="Portal link for"]').first().click();
    await page.waitForSelector("text=Portal Link");
    await expect(page.locator('input[aria-label="Portal link"]')).toHaveValue(/\/portal\//);
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("players — balance scrimmage teams dialog, teams generated", async ({ page }) => {
    await login(page);
    await page.goto("/players");
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Balance Teams")');
    await page.waitForSelector("text=Balance Scrimmage Teams");
    await page.click('button:has-text("Generate Teams")');
    await page.waitForSelector("text=Team 1");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("player portal page (public, no session)", async ({ page }) => {
    await login(page);
    await page.goto("/players");
    await page.waitForLoadState("networkidle");
    await page.locator('button[aria-label^="Portal link for"]').first().click();
    await page.waitForSelector("text=Portal Link");
    const input = page.locator('input[aria-label="Portal link"]');
    await expect(input).toHaveValue(/\/portal\//);
    const url = await input.inputValue();

    await page.goto(url);
    await page.waitForLoadState("networkidle");
    // The portal is the app's only surface a non-coach ever sees, so it
    // carries the one conversion CTA in the whole product — a link back to
    // signup, prefilled to skip straight past the login form.
    await expect(page.locator('a[href="/?signup=1"]')).toBeVisible();
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("player profile", async ({ page }) => {
    await login(page);
    await page.goto("/players");
    await page.waitForLoadState("networkidle");
    await page.locator('[role="button"][aria-label^="View "]').first().click();
    await page.waitForSelector("text=Rate Player");
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("player profile — rate player dialog open", async ({ page }) => {
    await login(page);
    await page.goto("/players");
    await page.waitForLoadState("networkidle");
    await page.locator('[role="button"][aria-label^="View "]').first().click();
    await page.waitForSelector("text=Rate Player");
    await page.click('button:has-text("Rate Player")');
    await page.waitForSelector("text=Score each skill");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("player profile — export season report PDF", async ({ page }) => {
    await login(page);
    await page.goto("/players");
    await page.waitForLoadState("networkidle");
    await page.locator('[role="button"][aria-label^="View "]').first().click();
    await page.waitForSelector("text=Rate Player");
    const downloadPromise = page.waitForEvent("download");
    await page.click('button:has-text("Season Report")');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/season-report\.pdf$/);
  });

  test("player profile — injury reported", async ({ page }) => {
    await login(page);
    await page.goto("/players");
    await page.waitForLoadState("networkidle");
    await page.locator('[role="button"][aria-label^="View "]').first().click();
    await page.waitForSelector("text=Rate Player");
    await page.fill('input[aria-label="Injury description"]', "Sprained ankle");
    await page.click('button:has-text("Report Injury")');
    await page.waitForSelector("text=Sprained ankle");
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("weekly schedule", async ({ page }) => {
    await login(page);
    await page.goto("/weekly-schedule");
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("weekly schedule — attendance modal open", async ({ page }) => {
    await login(page);
    await page.goto("/weekly-schedule");
    await page.waitForLoadState("networkidle");
    const sessionCard = page.locator('[role="button"][aria-label*="Open attendance"]').first();
    if (await sessionCard.count() === 0) test.skip(true, "no sessions this week to open");
    await sessionCard.click();
    await page.waitForSelector("text=/Attendance - /");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("weekly schedule — mark all present", async ({ page }) => {
    await login(page);
    await page.goto("/weekly-schedule");
    await page.waitForLoadState("networkidle");
    const sessionCard = page.locator('[role="button"][aria-label*="Open attendance"]').first();
    if (await sessionCard.count() === 0) test.skip(true, "no sessions this week to open");
    await sessionCard.click();
    await page.waitForSelector("text=/Attendance - /");
    const markAllButton = page.locator('button:has-text("Mark all present")');
    if (await markAllButton.count() === 0) test.skip(true, "no active players to mark present");
    await markAllButton.click();
    await page.waitForTimeout(300);
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("weekly schedule — drill tracker tab with an attempt logged", async ({ page }) => {
    await login(page);
    await page.goto("/weekly-schedule");
    await page.waitForLoadState("networkidle");
    const sessionCard = page.locator('[role="button"][aria-label*="Open attendance"]').first();
    if (await sessionCard.count() === 0) test.skip(true, "no sessions this week to open");
    await sessionCard.click();
    await page.waitForSelector("text=/Attendance - /");
    await page.click('button:has-text("Drills")');
    await page.fill("#drill-tracker-name", "Free throws");
    await page.locator('button[aria-label^="Log made attempt for"]').first().click();
    await page.waitForSelector("text=/1\\/1 \\(100%\\)/");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("weekly schedule — drill tracker shot chart with a shot logged", async ({ page }) => {
    await login(page);
    await page.goto("/weekly-schedule");
    await page.waitForLoadState("networkidle");
    const sessionCard = page.locator('[role="button"][aria-label*="Open attendance"]').first();
    if (await sessionCard.count() === 0) test.skip(true, "no sessions this week to open");
    await sessionCard.click();
    await page.waitForSelector("text=/Attendance - /");
    await page.click('button:has-text("Drills")');
    await page.fill("#drill-tracker-name", "Jump shots");
    await page.click('button:has-text("Shot Chart")');
    await page.locator('svg[aria-label^="Shot chart for"]').click({ position: { x: 100, y: 80 } });
    await page.waitForTimeout(300);
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("weekly schedule — recurring schedule dialog open", async ({ page }) => {
    await login(page);
    await page.goto("/weekly-schedule");
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Weekly Times")');
    await page.waitForSelector("text=Weekly Practice Schedule");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("weekly schedule — recurring schedule dialog with a slot added", async ({ page }) => {
    await login(page);
    await page.goto("/weekly-schedule");
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Weekly Times")');
    await page.waitForSelector("text=Weekly Practice Schedule");
    await page.fill("#recurring-slot-name", "Tuesday Practice");
    await page.click('button:has-text("Add Practice Time")');
    await page.waitForSelector("text=Tuesday Practice");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("games", async ({ page }) => {
    await login(page);
    await page.goto("/games");
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("games — log game modal open", async ({ page }) => {
    await login(page);
    await page.goto("/games");
    await page.click('button:has-text("New Game")');
    await page.waitForSelector("text=Log a Game");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("games — player stats tab", async ({ page }) => {
    await login(page);
    await page.goto("/games");
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Player Stats")');
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("games — manual entry form open", async ({ page }) => {
    await login(page);
    await page.goto("/games");
    await page.click('button:has-text("New Game")');
    await page.waitForSelector("text=Log a Game");
    await page.click("text=Enter Manually");
    await page.waitForSelector('label:has-text("Opponent")');
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("playbook", async ({ page }) => {
    await login(page);
    await page.goto("/playbook");
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("playbook — new play editor", async ({ page }) => {
    await login(page);
    await page.goto("/playbook/new");
    await page.waitForSelector('input[aria-label="Play name"]');
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("privacy policy page", async ({ page }) => {
    await page.goto("/privacy");
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("terms of use page", async ({ page }) => {
    await page.goto("/terms");
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("support page", async ({ page }) => {
    await page.goto("/support");
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("coach settings page (Club plan)", async ({ page }) => {
    await login(page);
    await page.goto("/settings/coaches");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=Manage Coaches");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("coach settings page — invite sent, shows in pending list", async ({ page }) => {
    await login(page);
    await page.goto("/settings/coaches");
    await page.waitForLoadState("networkidle");
    const email = `e2e-invite-${Date.now()}@example.com`;
    await page.fill('input[type="email"]', email);
    await page.click('button:has-text("Send Invite")');
    await page.waitForSelector(`text=${email}`);
    // Dismiss the confirmation toast before scanning — Radix's own toast
    // viewport (an <ol> with a portal wrapper between it and its <li>) trips
    // axe's list-nesting rule regardless of what page it's shown on, a
    // pre-existing upstream quirk unrelated to what this test is checking.
    await page.click('button[aria-label="Close"]');
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    // Revoke what this test just created — the shared test account only has
    // 3 Club coach seats, and re-running this test against the same dev DB
    // would otherwise pile up pending invites until every seat is used and
    // the invite field stops accepting new addresses.
    await page.click(`button[aria-label="Revoke invite for ${email}"]`);
  });

  test("billing success page", async ({ page }) => {
    await login(page);
    await page.goto("/billing/success");
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("billing cancel page", async ({ page }) => {
    await login(page);
    await page.goto("/billing/cancel");
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("dark mode — dashboard", async ({ page }) => {
    await login(page);
    await page.click('button[aria-label="Switch to dark mode"]');
    await page.waitForTimeout(200);
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });
});
