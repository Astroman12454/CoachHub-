import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login, TEST_EMAIL, TEST_PASSWORD } from "./helpers";

// axe's default ruleset (WCAG 2.0/2.1 A+AA, best-practices) — includes
// color-contrast, so this also covers the "revisión de contraste de color
// real" leg of Fase 6 without a separate tool.
async function scan(page: import("@playwright/test").Page, options?: { disableRules?: string[] }) {
  const builder = new AxeBuilder({ page });
  if (options?.disableRules) builder.disableRules(options.disableRules);
  return builder.analyze();
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

    test("signup — welcome dialog suggests a coach to follow", async ({ page }) => {
      // A throwaway coach shares an exercise first so the brand-new signup
      // below actually has someone to be suggested (see
      // WelcomeFollowCoachesDialog — it stays closed if there's nobody to
      // recommend).
      const suggestRes = await page.request.post("/api/signup", {
        data: { email: `e2e-welcome-suggest-${Date.now()}@coachhub.test`, password: "e2e-test-password-123" },
      });
      await page.request.put("/api/account/public-name", { data: { publicName: `E2E Welcome Coach ${Date.now()}` } });
      // A free-plan account can't create a custom exercise, but every
      // signup is seeded with the default library — share one of those.
      const seeded = await (await page.request.get("/api/exercises")).json();
      await page.request.put(`/api/exercises/${seeded[0].id}/share-community`, { data: { shared: true } });
      expect(suggestRes.ok()).toBe(true);
      // page.request shares this context's cookie jar with page.goto below —
      // without logging back out, the throwaway coach's session would still
      // be active and "/?signup=1" would bounce straight to its dashboard
      // instead of showing the signup form.
      await page.request.post("/api/logout");

      // Now sign up as a genuinely new coach through the real UI form —
      // the dialog only ever opens off the sessionStorage flag set inside
      // use-auth's signupMutation, never for a login or an API-only signup.
      await page.goto("/?signup=1");
      await page.waitForLoadState("networkidle");
      await page.fill("#email", `e2e-new-coach-${Date.now()}@coachhub.test`);
      await page.fill("#password", "e2e-test-password-123");
      await page.check("#age-confirmation");
      await page.click('button:has-text("Create Account")');

      await page.waitForSelector("text=Welcome to CoachHub!");
      // Not asserting our own throwaway coach specifically appears — ranking
      // is by likes/exercise count across every coach ever shared in this
      // dev DB (see getSuggestedCoaches), so an older candidate can easily
      // outrank it. The row existing at all is the thing this test is for.
      await page.locator('button[aria-label^="Follow "]').first().click();
      const results = await scan(page);
      expect(summarize(results.violations)).toEqual([]);

      await page.click('button:has-text("Continue")');
      await expect(page.locator("text=Welcome to CoachHub!")).toHaveCount(0);
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

  test("dashboard — rename team from the sidebar switcher", async ({ page }) => {
    await login(page);
    await page.waitForLoadState("networkidle");
    const sessionRes = await page.request.get("/api/session");
    const session = await sessionRes.json();
    const originalName = session.teams.find((t: { id: number }) => t.id === session.currentTeamId).name;

    const pencil = page.locator('button[aria-label^="Rename "]');
    await pencil.click();
    await page.waitForSelector("text=Rename Team");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    const input = page.locator("#rename-team-name");
    await input.fill("E2E Renamed Team");
    await page.click('button:has-text("Save")');
    await page.waitForSelector("text=Team renamed");
    await expect(page.locator('button[aria-label^="Rename "]')).toHaveAttribute("aria-label", "Rename E2E Renamed Team");

    // Restore the shared fixture's team name so other tests aren't affected.
    await page.click('button[aria-label="Rename E2E Renamed Team"]');
    await page.waitForSelector("text=Rename Team");
    await page.fill("#rename-team-name", originalName);
    await page.click('button:has-text("Save")');
    await page.waitForSelector("text=Team renamed");
  });

  test("dashboard — AI recommendations modal open", async ({ page }) => {
    await login(page);
    await page.click('button:has-text("View AI Recommendations")');
    await page.waitForSelector("text=AI Training Recommendations");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("dashboard — command bar reports an error when AI isn't configured", async ({ page }) => {
    // No ANTHROPIC_API_KEY in this test environment, so this exercises the
    // real (not mocked) "couldn't understand that" failure path.
    await login(page);
    await page.fill('input[aria-label*="create a session"]', "create a session tomorrow at 6pm");
    await page.click('button[aria-label="Run command"]');
    await page.waitForSelector("text=Couldn't understand that");
    // This is the first test in the suite that scans while a toast is
    // actually open. That surfaced pre-existing violations inside Radix's
    // own ToastPrimitives.Viewport — visually-hidden aria-hidden/tabindex=0
    // focus-sentinel spans either side of the <ol>, a deliberate (if
    // axe-unfriendly) keyboard-navigation technique in @radix-ui/react-toast
    // itself, not in this app's toast.tsx wrapper or in CommandBar. Disabled
    // here rather than fixed, since a real fix means patching or replacing
    // the upstream Toast primitive — out of scope for this feature.
    const results = await scan(page, { disableRules: ["aria-hidden-focus", "list", "aria-allowed-role"] });
    expect(summarize(results.violations)).toEqual([]);
  });

  test("dashboard — repeat last session opens the duplicate modal prefilled to a future date", async ({ page }) => {
    await login(page);
    const exercisesRes = await page.request.get("/api/exercises");
    const exercises = await exercisesRes.json();
    const createRes = await page.request.post("/api/training-sessions", {
      data: {
        name: "E2E Repeat Source Session",
        date: "2020-01-01",
        time: "17:00",
        duration: 60,
        exerciseIds: exercises.slice(0, 1).map((e: { id: number }) => e.id.toString()),
        notes: null,
      },
    });
    const created = await createRes.json();
    await page.request.put(`/api/training-sessions/${created.id}`, { data: { status: "completed" } });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Repeat Last Session")');
    await page.waitForSelector("text=Duplicate Training Session");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    // Prefilled with the source session's exercises and a date in the future
    // (not the 2020 date it was duplicated from).
    await expect(page.locator('input[name="date"]')).toHaveValue(/^20[2-9]\d-\d{2}-\d{2}$/);
    const dateValue = await page.locator('input[name="date"]').inputValue();
    expect(dateValue >= new Date().toISOString().split("T")[0]).toBe(true);

    await page.request.delete(`/api/training-sessions/${created.id}`);
  });

  test("dashboard — today's hero warns when the session has no exercises yet", async ({ page }) => {
    await login(page);
    const createRes = await page.request.post("/api/training-sessions", {
      data: {
        name: "E2E No-Exercises Today Session",
        date: new Date().toISOString().split("T")[0],
        time: "05:00",
        duration: 60,
        exerciseIds: [],
        notes: null,
      },
    });
    const created = await createRes.json();

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=E2E No-Exercises Today Session");
    const warning = page.getByRole("button", { name: /has no exercises yet/i });
    await expect(warning).toBeVisible();
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    // Tapping it opens the session editor (not "create new") — the coach
    // fixes the same session, not a different one.
    await warning.click();
    await page.waitForSelector("text=Edit Training Session");
    await expect(page.locator('input[name="name"]')).toHaveValue("E2E No-Exercises Today Session");

    await page.request.delete(`/api/training-sessions/${created.id}`);
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

  test("training sessions — drag to reorder exercises in the timeline", async ({ page }) => {
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

    const timelineItems = page.locator("ol > li");
    await expect(timelineItems).toHaveCount(Math.min(3, count));
    // span.truncate (not just .font-medium — the up/down/remove buttons in
    // each block also carry font-medium from their own base button style).
    const namesBefore = await timelineItems.locator("span.truncate").allTextContents();

    // Drag the first block's grip handle onto the last block — same
    // splice-based reorder the up/down buttons drive, exercised through
    // native HTML5 drag-and-drop instead.
    const firstGrip = timelineItems.first().locator('div[draggable="true"]');
    await firstGrip.dragTo(timelineItems.last());

    const namesAfter = await timelineItems.locator("span.truncate").allTextContents();
    expect(namesAfter).toEqual([...namesBefore.slice(1), namesBefore[0]]);

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

  test("training sessions — physical tests picker", async ({ page }) => {
    await login(page);
    await page.goto("/training-sessions");
    await page.click('button:has-text("New Session")');
    await page.waitForSelector("text=Create Training Session");
    await page.waitForSelector("text=Physical Tests");
    await page.locator('[aria-label="Physical tests to practice"] button').first().click();
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("training sessions — search and filter exercises by difficulty", async ({ page }) => {
    await login(page);
    await page.goto("/training-sessions");
    await page.click('button:has-text("New Session")');
    await page.waitForSelector("text=Create Training Session");
    await page.fill('input[aria-label="Search exercises..."]', "Sprint");
    await page.waitForLoadState("networkidle");
    const resultsAfterSearch = await scan(page);
    expect(summarize(resultsAfterSearch.violations)).toEqual([]);

    await page.fill('input[aria-label="Search exercises..."]', "");
    await page.locator('[aria-label="Filter by difficulty"]').click();
    await page.click('[role="option"]:has-text("Hard")');
    await page.waitForLoadState("networkidle");
    const resultsAfterDifficulty = await scan(page);
    expect(summarize(resultsAfterDifficulty.violations)).toEqual([]);
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

  test("training sessions — generate with AI requires a player count before it's enabled", async ({ page }) => {
    await login(page);
    await page.goto("/training-sessions");
    await page.click('button:has-text("New Session")');
    await page.waitForSelector("text=Create Training Session");
    await page.click('button:has-text("Generate with AI")');
    await page.waitForSelector("text=Picks exercises from your own library");

    const generateButton = page.locator('button:has-text("Generate Plan")');
    await expect(generateButton).toBeDisabled();

    await page.fill("#ai-player-count", "10");
    await expect(generateButton).toBeEnabled();
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

  test("training mode — pausing checkpoints progress, and reopening the session restores it", async ({ page }) => {
    await login(page);
    const exercisesRes = await page.request.get("/api/exercises");
    const exercises = await exercisesRes.json();
    const sessionRes = await page.request.post("/api/training-sessions", {
      data: {
        name: "E2E Resume Progress Session",
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

    // Move to the second exercise and pause — the checkpoint this test is
    // actually about.
    await page.click('button[aria-label="Next exercise"]');
    await page.waitForSelector("text=Exercise 2 of 2");
    await page.click('button[aria-label="Pause"]');
    await page.waitForSelector('button[aria-label="Resume"]');

    // Reopening the same session (as if the tab had been closed and
    // reopened) lands back on exercise 2, still paused — not reset to
    // exercise 1 with a full clock.
    await page.goto(`/training-sessions/${session.id}/live`);
    await page.waitForSelector("text=Exercise 2 of 2");
    await page.waitForSelector('button[aria-label="Resume"]');
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    // Finishing the session clears the checkpoint — a session reused later
    // (e.g. via "Repeat Last Session") shouldn't inherit stale progress.
    await page.click('button:has-text("Finish")');
    await page.waitForSelector("text=Finish this training session?");
    await page.click('[role="alertdialog"] button:has-text("Finish")');
    await page.waitForSelector("text=Session completed");
    await page.click('button:has-text("Done")');
    await page.waitForURL("/training-sessions");
    const storedProgress = await page.evaluate(
      (id) => window.localStorage.getItem(`coachhub.trainingProgress.${id}`),
      session.id
    );
    expect(storedProgress).toBeNull();

    await page.request.delete(`/api/training-sessions/${session.id}`);
  });

  test("training mode — physical test recorded before the exercise sequence", async ({ page }) => {
    await login(page);
    const [exercisesRes, testsRes] = await Promise.all([
      page.request.get("/api/exercises"),
      page.request.get("/api/physical-tests"),
    ]);
    const exercises = await exercisesRes.json();
    const tests = await testsRes.json();
    const sprintTest = tests.find((t: { name: string }) => t.name === "E2E Sprint Test");
    const sessionRes = await page.request.post("/api/training-sessions", {
      data: {
        name: "E2E Training Mode Session — Physical + Technical",
        date: new Date().toISOString().split("T")[0],
        time: "17:00",
        duration: 60,
        testIds: [sprintTest.id.toString()],
        exerciseIds: exercises.slice(0, 1).map((e: { id: number }) => e.id.toString()),
        notes: null,
      },
    });
    const session = await sessionRes.json();
    await page.goto(`/training-sessions/${session.id}/live`);
    await page.waitForSelector("text=Physical tests today");
    await page.click(`button:has-text("${sprintTest.name}")`);
    await page.waitForSelector("text=Record Results — E2E Sprint Test");
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

  test("training mode — sound toggle", async ({ page }) => {
    await login(page);
    const sessionsRes = await page.request.get("/api/training-sessions");
    const sessions = await sessionsRes.json();
    const today = new Date().toISOString().split("T")[0];
    const todaySession = sessions.find((s: { date: string }) => s.date === today);
    if (!todaySession) test.skip(true, "no session today to open in training mode");
    await page.goto(`/training-sessions/${todaySession.id}/live`);
    await page.waitForLoadState("networkidle");
    const toggle = page.locator('button[aria-label="Unmute sound"], button[aria-label="Mute sound"]');
    await expect(toggle).toBeVisible();
    await toggle.click();
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("training mode — finishing a session requires confirmation, and canceling doesn't complete it", async ({ page }) => {
    await login(page);
    const exercisesRes = await page.request.get("/api/exercises");
    const exercises = await exercisesRes.json();
    const sessionRes = await page.request.post("/api/training-sessions", {
      data: {
        name: "E2E Finish Confirmation Session",
        date: new Date().toISOString().split("T")[0],
        time: "17:00",
        duration: 60,
        exerciseIds: exercises.slice(0, 1).map((e: { id: number }) => e.id.toString()),
        notes: null,
      },
    });
    const session = await sessionRes.json();
    await page.goto(`/training-sessions/${session.id}/live`);
    await page.waitForSelector("text=Exercise 1 of 1");

    await page.click('button:has-text("Finish")');
    await page.waitForSelector("text=Finish this training session?");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    // Canceling must not complete the session — an accidental tap on
    // Finish mid-practice shouldn't silently close out the whole session.
    await page.click('button:has-text("Cancel")');
    await page.waitForTimeout(300);
    const midCheck = await page.request.get(`/api/training-sessions/${session.id}`);
    expect((await midCheck.json()).status).not.toBe("completed");
    await expect(page).toHaveURL(new RegExp(`/training-sessions/${session.id}/live`));

    // Confirming does complete it and shows a summary before leaving —
    // attendance, how many exercises ran, and a "Done" button, not an
    // immediate drop back to the sessions list with no closure. The active
    // player count isn't fixed (other tests in this shared fixture team add
    // players over time), so it's read from the API rather than hardcoded.
    const playersRes = await page.request.get("/api/players");
    const activePlayerCount = (await playersRes.json()).filter((p: { isActive: number }) => p.isActive === 1).length;

    await page.click('button:has-text("Finish")');
    await page.waitForSelector("text=Finish this training session?");
    await page.click('[role="alertdialog"] button:has-text("Finish")');
    await page.waitForSelector("text=Session completed");
    await page.waitForSelector(`text=0 of ${activePlayerCount} players present`);
    await page.waitForSelector("text=1 exercises run");
    const summaryResults = await scan(page);
    expect(summarize(summaryResults.violations)).toEqual([]);
    const finalCheck = await page.request.get(`/api/training-sessions/${session.id}`);
    expect((await finalCheck.json()).status).toBe("completed");

    await page.click('button:has-text("Done")');
    await page.waitForURL("/training-sessions");

    await page.request.delete(`/api/training-sessions/${session.id}`);
  });

  test("exercise library", async ({ page }) => {
    await login(page);
    await page.goto("/exercise-library");
    await page.waitForLoadState("networkidle");
    // Same fade-in/networkidle race as the "sort by recently used" test
    // below — settle before scanning so axe doesn't sample a card mid-fade.
    await page.waitForTimeout(700);
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("exercise library — Spanish translations appear in the library and in training mode", async ({ page }) => {
    await login(page);

    // Which seed exercises this fixture account actually has (and their
    // Spanish translations) depends on when the account was first
    // provisioned — read it back instead of hardcoding one, so this test
    // doesn't depend on the fixture always carrying a specific drill.
    const exercisesRes = await page.request.get("/api/exercises");
    const exercises = await exercisesRes.json();
    const translated = exercises.find((e: { nameEs: string | null }) => e.nameEs);
    expect(translated, "fixture account has no exercise with a Spanish translation to test against").toBeTruthy();

    await page.goto("/exercise-library");
    await page.waitForLoadState("networkidle");

    // English by default (the shared fixture's storageState was captured
    // before any language switch) — the seed exercise reads in English...
    await page.waitForSelector(`text=${translated.name}`);

    await page.click('button[aria-label="Switch to Spanish"]');
    // ...and in Spanish, the same card shows the translated name — not the
    // untranslated English one still sitting behind it.
    await page.waitForSelector(`text=${translated.nameEs}`);
    await expect(page.getByText(translated.name, { exact: true })).toHaveCount(0);
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    // The same translation applies live in Training Mode, not just the
    // library card — instructions included, not just the name.
    const sessionRes = await page.request.post("/api/training-sessions", {
      data: {
        name: "E2E Spanish Translation Session",
        date: new Date().toISOString().split("T")[0],
        time: "17:00",
        duration: 60,
        exerciseIds: [translated.id.toString()],
        notes: null,
      },
    });
    const session = await sessionRes.json();
    await page.goto(`/training-sessions/${session.id}/live`);
    await page.waitForSelector(`text=${translated.nameEs}`);
    if (translated.instructionsEs) {
      await page.waitForSelector(`text=${translated.instructionsEs}`);
    }

    await page.request.delete(`/api/training-sessions/${session.id}`);
  });

  test("exercise library — create exercise form open", async ({ page }) => {
    await login(page);
    await page.goto("/exercise-library");
    await page.click('button:has-text("Add Exercise")');
    await page.waitForSelector("text=Create New Exercise");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("exercise library — favoriting toggles the star and filters by favorites-only", async ({ page }) => {
    await login(page);
    await page.goto("/exercise-library");
    await page.waitForLoadState("networkidle");

    const star = page.locator('button[aria-label^="Favorite "]').first();
    await star.click();
    await expect(page.locator('button[aria-label^="Unfavorite "]').first()).toHaveAttribute("aria-pressed", "true");

    await page.click('button:has-text("Favorites only")');
    await expect(page.locator('button[aria-label^="Unfavorite "]').first()).toBeVisible();
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("exercise library — sort by recently used", async ({ page }) => {
    await login(page);
    await page.goto("/exercise-library");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Sort by").click();
    await page.click("text=Recently used");
    await page.waitForLoadState("networkidle");
    // The card grid re-renders with a staggered .fade-in on each card
    // (up to ~570ms to fully settle on a library this size); networkidle
    // fires as soon as the fetch resolves, which can be before that
    // animation finishes, so axe occasionally samples a card mid-fade at
    // partial opacity and reports a false color-contrast violation. Same
    // settle-before-scan pattern used elsewhere in this file.
    await page.waitForTimeout(700);
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("exercise library — filter by duration", async ({ page }) => {
    await login(page);
    await page.goto("/exercise-library");
    await page.waitForLoadState("networkidle");
    // Suicide Sprints (8 min) and Free Throw Form Drill (15 min) are both
    // part of the fixture account's seed library — a short/medium pair on
    // either side of the "under 15" boundary.
    await page.waitForSelector("text=Suicide Sprints");
    await page.waitForSelector("text=Free Throw Form Drill");

    await page.getByLabel("Filter by duration").click();
    await page.click("text=Under 15 min");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Suicide Sprints", { exact: true })).toBeVisible();
    await expect(page.getByText("Free Throw Form Drill", { exact: true })).toHaveCount(0);

    await page.getByLabel("Filter by duration").click();
    await page.click("text=15–30 min");
    await expect(page.getByText("Free Throw Form Drill", { exact: true })).toBeVisible();
    await expect(page.getByText("Suicide Sprints", { exact: true })).toHaveCount(0);

    const results2 = await scan(page);
    expect(summarize(results2.violations)).toEqual([]);
  });

  test("exercise library — duplicate flow pre-fills the form", async ({ page }) => {
    await login(page);
    await page.goto("/exercise-library");
    await page.waitForLoadState("networkidle");
    await page.locator('button[aria-label^="Duplicate "]').first().click();
    await page.waitForSelector("text=Duplicate Exercise");
    await expect(page.getByLabel("Exercise Name")).toHaveValue(/\(copy\)$/);
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("exercise library — share dialog open", async ({ page }) => {
    await login(page);
    await page.goto("/exercise-library");
    await page.waitForLoadState("networkidle");
    await page.locator('button[aria-label^="Share "]').first().click();
    await page.waitForSelector("text=Share Link");
    await expect(page.locator('input[aria-label="Share link"]')).toHaveValue(/\/exercise\//);
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("exercise library — create exercise form with a minimum players value", async ({ page }) => {
    await login(page);
    await page.goto("/exercise-library");
    await page.click('button:has-text("Add Exercise")');
    await page.waitForSelector("text=Create New Exercise");
    await page.fill('input[placeholder="e.g., 6"]', "6");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("exercise library — tagging an exercise's phase shows a badge and filters correctly", async ({ page }) => {
    await login(page);
    await page.goto("/exercise-library");
    await page.click('button:has-text("Add Exercise")');
    await page.waitForSelector("text=Create New Exercise");
    await page.fill('input[placeholder="e.g., Free Throw Form Drill"]', "E2E Warmup Drill");
    await page.fill('textarea[placeholder="Brief description of the exercise..."]', "A drill for testing phase tags");
    // Category, difficulty, and phase are the form's only comboboxes —
    // phase is the last of the three. Scoped to the open listbox (not a
    // bare text= click) since Radix's Select also renders a visually-hidden
    // native <select> for form autofill, whose <option>s share the same
    // text and would otherwise resolve ambiguously.
    await page.locator('button[role="combobox"]').last().click();
    await page.getByRole("listbox").getByText("Warm-up").click();
    await page.click('button:has-text("Create Exercise")');
    await page.waitForSelector("text=Exercise created successfully");

    await page.waitForSelector("text=E2E Warmup Drill");
    await expect(page.getByText("warm-up", { exact: true }).first()).toBeVisible();

    await page.getByLabel("Filter by phase").click();
    await page.getByRole("listbox").getByText("Cool-down").click();
    await expect(page.getByText("E2E Warmup Drill", { exact: true })).toHaveCount(0);
    await page.getByLabel("Filter by phase").click();
    await page.getByRole("listbox").getByText("Warm-up").click();
    await expect(page.getByText("E2E Warmup Drill", { exact: true }).first()).toBeVisible();

    // Same pre-existing Radix Toast a11y issue disabled elsewhere in this
    // file — the create-exercise toast from moments ago can still be mid-
    // transition when this scan runs.
    const results = await scan(page, { disableRules: ["aria-hidden-focus", "list", "aria-allowed-role"] });
    expect(summarize(results.violations)).toEqual([]);

    const exercisesRes = await page.request.get("/api/exercises");
    const exercises = await exercisesRes.json();
    // Delete every matching row, not just the one this run created — a
    // previous failed run could have left one behind.
    const created = exercises.filter((e: { name: string }) => e.name === "E2E Warmup Drill");
    await Promise.all(created.map((e: { id: number }) => page.request.delete(`/api/exercises/${e.id}`)));
  });

  test("exercise library — sharing to the community toggles the globe icon", async ({ page }) => {
    await login(page);
    await page.goto("/exercise-library");
    await page.waitForLoadState("networkidle");

    const shareToggle = page.locator('button[aria-label^="Add "][aria-label*="to the community"]').first();
    await shareToggle.click();
    await expect(page.locator('button[aria-label^="Remove "][aria-label*="from the community"]').first()).toHaveAttribute("aria-pressed", "true");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    // Revoke so this shared seeded account doesn't leave exercises shared
    // to the community across unrelated test runs.
    await page.locator('button[aria-label^="Remove "][aria-label*="from the community"]').first().click();
  });

  test("community exercises page", async ({ page }) => {
    await login(page);
    // Ensure at least one exercise is shared so the page isn't in its empty
    // state for this scan.
    const exercisesRes = await page.request.get("/api/exercises");
    const exercises = await exercisesRes.json();
    await page.request.put(`/api/exercises/${exercises[0].id}/share-community`, { data: { shared: true } });

    await page.goto("/exercise-library/community");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=Community Exercises");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    await page.request.put(`/api/exercises/${exercises[0].id}/share-community`, { data: { shared: false } });
  });

  test("community exercises page — Following tab empty state", async ({ page }) => {
    await login(page);
    await page.goto("/exercise-library/community");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=Community Exercises");
    await page.click('button[aria-pressed]:has-text("Following")');
    await page.waitForSelector("text=You're Not Following Any Coach Yet");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("community exercises page — suggested coaches row, follows from a suggestion", async ({ page }) => {
    // A throwaway second account publishes an exercise so it shows up as a
    // suggestion for the shared test account (which hasn't followed it).
    const secondEmail = `e2e-suggest-${Date.now()}@coachhub.test`;
    await page.request.post("/api/signup", { data: { email: secondEmail, password: "e2e-test-password-123" } });
    await page.request.put("/api/account/public-name", { data: { publicName: `E2E Suggested Coach ${Date.now()}` } });
    // A free-plan account can't create a custom exercise, but every signup
    // is seeded with the default library — share one of those instead.
    const seeded = await (await page.request.get("/api/exercises")).json();
    await page.request.put(`/api/exercises/${seeded[0].id}/share-community`, { data: { shared: true } });

    // Switch back to the shared test account for the rest of the test.
    await page.request.post("/api/login", { data: { email: TEST_EMAIL, password: TEST_PASSWORD } });

    await login(page);
    await page.goto("/exercise-library/community");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=Coaches you might like to follow");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("coach profile page — own profile, sharing an exercise", async ({ page }) => {
    await login(page);
    const create = await page.request.post("/api/exercises", {
      data: { name: "E2E Profile Drill", description: "Shared for coach profile testing", category: "shooting", duration: 10, difficulty: "easy" },
    });
    const exercise = await create.json();
    await page.request.put(`/api/exercises/${exercise.id}/share-community`, { data: { shared: true } });

    const communityRes = await page.request.get("/api/community-exercises");
    const community = await communityRes.json();
    const published = community.find((ex: { id: number }) => ex.id === exercise.id);

    await page.goto(`/coaches/${published.publishedBy.accountId}`);
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=E2E Profile Drill");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    await page.request.delete(`/api/exercises/${exercise.id}`);
  });

  test("notifications dialog — unread follow and like notifications", async ({ page }) => {
    await login(page);
    const sessionRes = await page.request.get("/api/session");
    const session = await sessionRes.json();
    const mainAccountId = session.account.id;

    const create = await page.request.post("/api/exercises", {
      data: { name: "E2E Notify Drill", description: "Shared for notification testing", category: "shooting", duration: 10, difficulty: "easy" },
    });
    const exercise = await create.json();
    await page.request.put(`/api/exercises/${exercise.id}/share-community`, { data: { shared: true } });

    // A throwaway second account generates a real follow + like notification
    // for the shared test account — signup/login both skip the rate limiter
    // on success (see server/auth.ts), so this is safe to do per-run.
    await page.request.post("/api/signup", { data: { email: `e2e-notify-${Date.now()}@coachhub.test`, password: "e2e-test-password-123" } });
    await page.request.post(`/api/coaches/${mainAccountId}/follow`);
    await page.request.post(`/api/community-exercises/${exercise.id}/like`);

    // Switch back to the shared test account for the rest of the test.
    await page.request.post("/api/login", { data: { email: TEST_EMAIL, password: TEST_PASSWORD } });

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.click('button[aria-label*="Notifications"]');
    await page.waitForSelector("text=E2E Notify Drill");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    await page.request.delete(`/api/exercises/${exercise.id}`);
  });

  test("exercise comments dialog — posts and shows a comment", async ({ page }) => {
    await login(page);
    const create = await page.request.post("/api/exercises", {
      data: { name: "E2E Comment Drill", description: "Shared for comment testing", category: "shooting", duration: 10, difficulty: "easy" },
    });
    const exercise = await create.json();
    await page.request.put(`/api/exercises/${exercise.id}/share-community`, { data: { shared: true } });

    await page.goto("/exercise-library/community");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=E2E Comment Drill");
    await page.click('button[aria-label="View comments on E2E Comment Drill"]');
    await page.waitForSelector("text=No comments yet — be the first.");

    await page.fill('textarea[aria-label="Add a comment…"]', "Great drill, thanks for sharing!");
    await page.click('button:has-text("Post")');
    await page.waitForSelector("text=Great drill, thanks for sharing!");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    await page.request.delete(`/api/exercises/${exercise.id}`);
  });

  test("community exercises — imports a shared drill into the library", async ({ page }) => {
    await login(page);
    const create = await page.request.post("/api/exercises", {
      data: { name: "E2E Community Drill", description: "Shared for import testing", category: "shooting", duration: 10, difficulty: "easy" },
    });
    const exercise = await create.json();
    await page.request.put(`/api/exercises/${exercise.id}/share-community`, { data: { shared: true } });

    await page.goto("/exercise-library/community");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=E2E Community Drill");
    await page.locator('button[aria-label="Import E2E Community Drill"]').first().click();
    await page.waitForSelector("text=Exercise imported");
    await page.click('button[aria-label="Close"]');
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    // Clean up what this test created so repeat runs don't accumulate
    // duplicate "E2E Community Drill" entries in the shared dev DB.
    await page.request.delete(`/api/exercises/${exercise.id}`);
  });

  test("community exercises page — saves a shared drill and shows it under the Saved tab", async ({ page }) => {
    await login(page);
    const create = await page.request.post("/api/exercises", {
      data: { name: "E2E Saved Drill", description: "Shared for save testing", category: "shooting", duration: 10, difficulty: "easy" },
    });
    const exercise = await create.json();
    await page.request.put(`/api/exercises/${exercise.id}/share-community`, { data: { shared: true } });

    await page.goto("/exercise-library/community");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=E2E Saved Drill");

    await page.click('button[aria-label="Save E2E Saved Drill"]');
    await expect(page.locator('button[aria-label="Unsave E2E Saved Drill"]')).toHaveAttribute("aria-pressed", "true");

    await page.click('button:has-text("Saved")');
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=E2E Saved Drill");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    await page.request.delete(`/api/exercises/${exercise.id}`);
  });

  test("exercise share page (public, no session)", async ({ page }) => {
    await login(page);
    await page.goto("/exercise-library");
    await page.waitForLoadState("networkidle");
    await page.locator('button[aria-label^="Share "]').first().click();
    await page.waitForSelector("text=Share Link");
    const input = page.locator('input[aria-label="Share link"]');
    await expect(input).toHaveValue(/\/exercise\//);
    const url = await input.inputValue();

    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("exercise diagram editor — opens for an exercise", async ({ page }) => {
    await login(page);
    await page.goto("/exercise-library");
    await page.waitForLoadState("networkidle");
    await page.locator('button[aria-label^="Diagram for "]').first().click();
    await page.waitForSelector("text=Save Diagram");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("exercise diagram editor — draws a step, plays the animation, and saves", async ({ page }) => {
    await login(page);
    const create = await page.request.post("/api/exercises", {
      data: { name: "E2E Diagram Drill", description: "For diagram editor testing", category: "shooting", duration: 10, difficulty: "easy" },
    });
    const exercise = await create.json();

    await page.goto(`/exercise-library/${exercise.id}/diagram`);
    await page.waitForSelector("text=Save Diagram");

    // Place an offense token, then add a second step so playback has
    // something to animate between.
    await page.click('button[aria-label="Offense"]');
    const canvas = page.locator('svg[aria-label="Half court diagram editor"]');
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas not found");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await page.getByRole("button", { name: "Step", exact: true }).click();
    await expect(page.locator('button[aria-pressed="true"]', { hasText: "Step 2" })).toBeVisible();

    await page.click('button[aria-label="Play animation"]');
    await page.waitForTimeout(300);
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    await page.click('button:has-text("Save Diagram")');
    await page.waitForURL(/\/exercise-library$/);

    // Clean up what this test created so repeat runs don't accumulate
    // duplicate "E2E Diagram Drill" entries in the shared dev DB.
    await page.request.delete(`/api/exercises/${exercise.id}`);
  });

  test("exercise diagram editor — undo and redo affect what actually gets saved", async ({ page }) => {
    await login(page);
    const create = await page.request.post("/api/exercises", {
      data: { name: "E2E Diagram Undo Drill", description: "For undo/redo testing", category: "shooting", duration: 10, difficulty: "easy" },
    });
    const exercise = await create.json();

    await page.goto(`/exercise-library/${exercise.id}/diagram`);
    await page.waitForSelector("text=Save Diagram");

    const undoBtn = page.locator('button[aria-label="Undo"]');
    const redoBtn = page.locator('button[aria-label="Redo"]');
    await expect(undoBtn).toBeDisabled();
    await expect(redoBtn).toBeDisabled();

    await page.click('button[aria-label="Offense"]');
    const canvas = page.locator('svg[aria-label="Half court diagram editor"]');
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas not found");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(undoBtn).toBeEnabled();

    await undoBtn.click();
    await expect(undoBtn).toBeDisabled();
    await expect(redoBtn).toBeEnabled();

    await redoBtn.click();
    await expect(redoBtn).toBeDisabled();
    await expect(undoBtn).toBeEnabled();

    await page.click('button:has-text("Save Diagram")');
    await page.waitForURL(/\/exercise-library$/);

    const fetched = await page.request.get(`/api/exercises/${exercise.id}`);
    const data = await fetched.json();
    expect(data.steps[0].tokens).toHaveLength(1);
    expect(data.steps[0].tokens[0].type).toBe("offense");

    await page.request.delete(`/api/exercises/${exercise.id}`);
  });

  test("exercise diagram editor — places a cone and draws a curved arrow", async ({ page }) => {
    await login(page);
    const create = await page.request.post("/api/exercises", {
      data: { name: "E2E Diagram Cone Drill", description: "For cone/curve testing", category: "shooting", duration: 10, difficulty: "easy" },
    });
    const exercise = await create.json();

    await page.goto(`/exercise-library/${exercise.id}/diagram`);
    await page.waitForSelector("text=Save Diagram");

    await page.click('button[aria-label="Cone"]');
    const canvas = page.locator('svg[aria-label="Half court diagram editor"]');
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas not found");
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);

    await page.click('button[aria-label="Move Arrow"]');
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.75, { steps: 8 });
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.2, { steps: 8 });
    await page.mouse.up();

    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    await page.click('button:has-text("Save Diagram")');
    await page.waitForURL(/\/exercise-library$/);

    const fetched = await page.request.get(`/api/exercises/${exercise.id}`);
    const data = await fetched.json();
    expect(data.steps[0].tokens).toHaveLength(1);
    expect(data.steps[0].tokens[0].type).toBe("cone");
    expect(data.steps[0].drawings).toHaveLength(1);
    expect(data.steps[0].drawings[0].points.length).toBeGreaterThan(2);

    await page.request.delete(`/api/exercises/${exercise.id}`);
  });

  test("exercise diagram editor — remove diagram confirm dialog", async ({ page }) => {
    await login(page);
    const create = await page.request.post("/api/exercises", {
      data: { name: "E2E Diagram Removal Drill", description: "For diagram removal testing", category: "shooting", duration: 10, difficulty: "easy" },
    });
    const exercise = await create.json();
    await page.request.put(`/api/exercises/${exercise.id}/diagram`, {
      data: { courtType: "half", steps: [{ tokens: [{ id: "o1", type: "offense", label: "1", x: 50, y: 90 }], drawings: [] }] },
    });

    await page.goto(`/exercise-library/${exercise.id}/diagram`);
    await page.waitForSelector("text=Remove Diagram");
    await page.click('button:has-text("Remove Diagram")');
    await page.waitForSelector("text=Remove this diagram?");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    await page.request.delete(`/api/exercises/${exercise.id}`);
  });

  test("exercise share page — renders the animated diagram when the exercise has one", async ({ page }) => {
    await login(page);
    const create = await page.request.post("/api/exercises", {
      data: { name: "E2E Shared Diagram Drill", description: "For share-page diagram testing", category: "shooting", duration: 10, difficulty: "easy" },
    });
    const exercise = await create.json();
    await page.request.put(`/api/exercises/${exercise.id}/diagram`, {
      data: {
        courtType: "half",
        steps: [
          { tokens: [{ id: "o1", type: "offense", label: "1", x: 50, y: 90 }], drawings: [] },
          { tokens: [{ id: "o1", type: "offense", label: "1", x: 50, y: 50 }], drawings: [] },
        ],
      },
    });
    const link = await page.request.post(`/api/exercises/${exercise.id}/share-link`);
    const { token } = await link.json();

    await page.goto(`/exercise/${token}`);
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=Diagram");
    await expect(page.locator('button[aria-label="Play animation"]')).toBeVisible();
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    await page.request.delete(`/api/exercises/${exercise.id}`);
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

  test("physical tests — sharing to the community toggles the globe icon", async ({ page }) => {
    await login(page);
    await page.goto("/physical-tests");
    await page.waitForLoadState("networkidle");

    const shareToggle = page.locator('button[aria-label^="Add "][aria-label*="to the community"]').first();
    await shareToggle.click();
    await expect(page.locator('button[aria-label^="Remove "][aria-label*="from the community"]').first()).toHaveAttribute("aria-pressed", "true");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    await page.locator('button[aria-label^="Remove "][aria-label*="from the community"]').first().click();
  });

  test("community physical tests page — likes, saves, and comments a shared test", async ({ page }) => {
    await login(page);
    const create = await page.request.post("/api/physical-tests", {
      data: { name: "E2E Community Test", unit: "seconds", lowerIsBetter: 1, description: "Shared for community testing" },
    });
    const test = await create.json();
    await page.request.put(`/api/physical-tests/${test.id}/share-community`, { data: { shared: true } });

    await page.goto("/physical-tests/community");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=E2E Community Test");

    await page.click('button[aria-label="Like E2E Community Test"]');
    await expect(page.locator('button[aria-label="Unlike E2E Community Test"]')).toHaveAttribute("aria-pressed", "true");

    await page.click('button[aria-label="Save E2E Community Test"]');
    await expect(page.locator('button[aria-label="Unsave E2E Community Test"]')).toHaveAttribute("aria-pressed", "true");

    await page.click('button[aria-label="View comments on E2E Community Test"]');
    await page.fill('textarea[aria-label="Add a comment…"]', "Solid test!");
    await page.click('button:has-text("Post")');
    await page.waitForSelector("text=Solid test!");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    await page.request.delete(`/api/physical-tests/${test.id}`);
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

  test("physical tests — beating a previous result shows the new personal record toast", async ({ page }) => {
    await login(page);
    // A unique name per run — a fixed name would collide with players left
    // over from earlier runs and pick up their result history, throwing off
    // the personal-record comparison this test is checking.
    const playerName = `E2E PR Player ${Date.now()}`;
    await page.request.post("/api/players", { data: { name: playerName, isActive: 1 } });

    await page.goto("/physical-tests");
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Record Results")');
    await page.waitForSelector("text=Record Results — E2E Sprint Test");
    await page.getByLabel(playerName, { exact: true }).fill("9.8");
    await page.click('button:has-text("Save Results")');
    await page.waitForSelector("text=Results saved");

    await page.click('button:has-text("Record Results")');
    await page.waitForSelector("text=Record Results — E2E Sprint Test");
    // Sprint test is lower-is-better (seconds) — a faster time than the 9.8
    // recorded above is a new personal record.
    await page.getByLabel(playerName, { exact: true }).fill("9.2");
    await page.click('button:has-text("Save Results")');
    await page.waitForSelector("text=New personal record!");
    // Same pre-existing Radix Toast a11y issue disabled in the command-bar
    // error-toast test above — not introduced by this feature.
    const results = await scan(page, { disableRules: ["aria-hidden-focus", "list", "aria-allowed-role"] });
    expect(summarize(results.violations)).toEqual([]);
  });

  test("player profile — physical test evolution chart", async ({ page }) => {
    await login(page);
    const playerRes = await page.request.post("/api/players", { data: { name: "E2E Chart Player", isActive: 1 } });
    const player = await playerRes.json();
    const testsRes = await page.request.get("/api/physical-tests");
    const tests = await testsRes.json();
    const sprintTest = tests.find((t: { name: string }) => t.name === "E2E Sprint Test");
    await page.request.post(`/api/physical-tests/${sprintTest.id}/results`, {
      data: { date: "2026-01-01", results: [{ playerId: player.id, value: 10.0 }] },
    });
    await page.request.post(`/api/physical-tests/${sprintTest.id}/results`, {
      data: { date: "2026-02-01", results: [{ playerId: player.id, value: 9.5 }] },
    });

    await page.goto(`/players/${player.id}`);
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("E2E Sprint Test")');
    await page.waitForSelector('svg[aria-label^="Trend chart"]');
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

  test("players — edit player form open, with birth date and height", async ({ page }) => {
    await login(page);
    await page.goto("/players");
    await page.waitForLoadState("networkidle");
    await page.locator('button[aria-label^="Edit "]').first().click();
    await page.waitForSelector("text=Edit Player");
    await page.fill('input[type="date"]', "2011-03-04");
    await page.fill('input[type="number"]', "170");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("players — filter by position", async ({ page }) => {
    await login(page);
    await page.goto("/players");
    await page.waitForLoadState("networkidle");
    await page.locator('[aria-label="Filter by position"]').click();
    await page.locator('[role="option"]').first().click();
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("players — edit player form open, with captain, dominant hand, and emergency contact filled", async ({ page }) => {
    await login(page);
    await page.goto("/players");
    await page.waitForLoadState("networkidle");
    await page.locator('button[aria-label^="Edit "]').first().click();
    await page.waitForSelector("text=Edit Player");
    await page.getByLabel("Dominant Hand").click();
    await page.click('[role="option"]:has-text("Left")');
    await page.fill('input[placeholder*="Jane García"]', "Pat García");
    await page.fill('input[type="tel"]', "555-0100");
    await page.fill('textarea', "Mild asthma, carries an inhaler");
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

  test("weekly schedule — export PDF downloads the current week", async ({ page }) => {
    await login(page);
    await page.goto("/weekly-schedule");
    await page.waitForLoadState("networkidle");
    const downloadPromise = page.waitForEvent("download");
    await page.click('button:has-text("Export PDF")');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^\d{4}-\d{2}-\d{2}-weekly-schedule\.pdf$/);
  });

  test("weekly schedule — attendance modal open", async ({ page }) => {
    await login(page);
    await page.goto("/weekly-schedule");
    await page.waitForLoadState("networkidle");
    const sessionCard = page.locator('button[aria-label*="Open attendance"]').first();
    if (await sessionCard.count() === 0) test.skip(true, "no sessions this week to open");
    await sessionCard.click();
    await page.waitForSelector("text=/Attendance - /");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("weekly schedule — edit pencil opens the session editor, not attendance", async ({ page }) => {
    await login(page);
    const today = new Date().toISOString().split("T")[0];
    const created = await page.request.post("/api/training-sessions", {
      data: { name: "E2E Weekly Edit Session", date: today, time: "16:00", duration: 60, exerciseIds: [], notes: null },
    });
    const session = await created.json();

    await page.goto("/weekly-schedule");
    await page.waitForLoadState("networkidle");

    await page.locator('button[aria-label="Edit E2E Weekly Edit Session"]').first().click();
    await page.waitForSelector("text=Edit Training Session");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    // The pencil must not also trigger the card's own attendance-opening click.
    await expect(page.locator("text=/Attendance - /")).not.toBeVisible();

    await page.click('button:has-text("Cancel")');
    await page.waitForTimeout(300);

    // The card itself, clicked normally, still opens attendance as before.
    await page.getByRole("button", { name: /^E2E Weekly Edit Session/ }).first().click();
    await page.waitForSelector("text=/Attendance - /");

    await page.request.delete(`/api/training-sessions/${session.id}`);
  });

  test("weekly schedule — month view", async ({ page }) => {
    await login(page);
    await page.goto("/weekly-schedule");
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Month")');
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("weekly schedule — attendance modal, marks a player absent and enters a reason", async ({ page }) => {
    await login(page);
    await page.goto("/weekly-schedule");
    await page.waitForLoadState("networkidle");
    const sessionCard = page.locator('button[aria-label*="Open attendance"]').first();
    if (await sessionCard.count() === 0) test.skip(true, "no sessions this week to open");
    await sessionCard.click();
    await page.waitForSelector("text=/Attendance - /");
    const absentButton = page.locator('button:has-text("Absent")').first();
    if (await absentButton.count() === 0) test.skip(true, "no active players to mark absent");
    await absentButton.click();
    await page.waitForSelector('input[placeholder*="Reason"]');
    await page.fill('input[placeholder*="Reason"]', "Sick");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("weekly schedule — mark all present", async ({ page }) => {
    await login(page);
    await page.goto("/weekly-schedule");
    await page.waitForLoadState("networkidle");
    const sessionCard = page.locator('button[aria-label*="Open attendance"]').first();
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
    const sessionCard = page.locator('button[aria-label*="Open attendance"]').first();
    if (await sessionCard.count() === 0) test.skip(true, "no sessions this week to open");
    await sessionCard.click();
    await page.waitForSelector("text=/Attendance - /");
    await page.click('button:has-text("Drills")');
    await page.fill("#drill-tracker-name", "Free throws");
    await page.locator('button[aria-label^="Log made attempt for"]').first().click();
    await page.waitForSelector("text=/1\\/1 \\(100%\\)/");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    // Undo the attempt this test just logged — the tally is shared, global
    // per-player state (not scoped to this one session), so leaving it
    // behind would make every future run see 2/2, 3/3, and so on instead
    // of the 1/1 this test actually asserts on.
    await page.locator('button[aria-label^="Undo last attempt for"]').first().click();
    await page.waitForSelector("text=No attempts logged yet");
  });

  test("weekly schedule — drill tracker shot chart with a shot logged", async ({ page }) => {
    await login(page);
    await page.goto("/weekly-schedule");
    await page.waitForLoadState("networkidle");
    const sessionCard = page.locator('button[aria-label*="Open attendance"]').first();
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

  test("games — season record stat cards, with a decided game logged", async ({ page }) => {
    await login(page);
    await page.request.post("/api/games", {
      data: {
        opponent: "E2E Rivals",
        date: new Date().toISOString().split("T")[0],
        teamScore: 60,
        opponentScore: 50,
      },
    });
    await page.goto("/games");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=Win %");
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

  test("playbook — new play editor, situation selected", async ({ page }) => {
    await login(page);
    await page.goto("/playbook/new");
    await page.waitForSelector('input[aria-label="Play name"]');
    await page.getByLabel("Situation").click();
    await page.getByRole("option", { name: "Press break" }).click();
    await page.waitForLoadState("networkidle");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("playbook — new play editor: cone, curved arrow, and undo/redo persist correctly", async ({ page }) => {
    await login(page);
    await page.goto("/playbook/new");
    await page.waitForSelector('input[aria-label="Play name"]');
    await page.fill('input[aria-label="Play name"]', "E2E Cone Curve Play");

    const undoBtn = page.locator('button[aria-label="Undo"]');
    await expect(undoBtn).toBeDisabled();

    await page.click('button[aria-label="Cone"]');
    const canvas = page.locator('svg[aria-label="Half court play diagram editor"]');
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas not found");
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await expect(undoBtn).toBeEnabled();

    await page.click('button[aria-label="Move Arrow"]');
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.75, { steps: 8 });
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.2, { steps: 8 });
    await page.mouse.up();

    // Undo the arrow, leaving just the cone.
    await undoBtn.click();

    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    await page.click('button:has-text("Save Play")');
    await page.waitForURL(/\/playbook$/);

    const list = await page.request.get("/api/plays");
    const plays = await list.json();
    const created = plays.find((p: { name: string }) => p.name === "E2E Cone Curve Play");
    expect(created).toBeTruthy();
    const fetched = await page.request.get(`/api/plays/${created.id}`);
    const data = await fetched.json();
    expect(data.steps[0].tokens).toHaveLength(1);
    expect(data.steps[0].tokens[0].type).toBe("cone");
    expect(data.steps[0].drawings).toHaveLength(0);

    await page.request.delete(`/api/plays/${created.id}`);
  });

  test("playbook — search filters by name", async ({ page }) => {
    await login(page);
    await page.goto("/playbook");
    await page.waitForLoadState("networkidle");
    await page.fill('input[aria-label="Search plays..."]', "E2E Test Play");
    await page.waitForSelector("text=E2E Test Play");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    await page.fill('input[aria-label="Search plays..."]', "no play matches this");
    await page.waitForSelector("text=No Plays Yet");
  });

  test("playbook — favoriting toggles the star and filters by favorites-only", async ({ page }) => {
    await login(page);
    await page.goto("/playbook");
    await page.waitForLoadState("networkidle");

    const star = page.locator('button[aria-label^="Favorite "]').first();
    await star.click();
    await expect(page.locator('button[aria-label^="Unfavorite "]').first()).toHaveAttribute("aria-pressed", "true");

    await page.click('button:has-text("Favorites only")');
    await expect(page.locator('button[aria-label^="Unfavorite "]').first()).toBeVisible();
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("playbook — sharing to the community toggles the globe icon", async ({ page }) => {
    await login(page);
    await page.goto("/playbook");
    await page.waitForLoadState("networkidle");

    const shareToggle = page.locator('button[aria-label^="Add "][aria-label*="to the community"]').first();
    await shareToggle.click();
    await expect(page.locator('button[aria-label^="Remove "][aria-label*="from the community"]').first()).toHaveAttribute("aria-pressed", "true");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    await page.locator('button[aria-label^="Remove "][aria-label*="from the community"]').first().click();
  });

  test("community plays page — likes, saves, and comments a shared play", async ({ page }) => {
    await login(page);
    const create = await page.request.post("/api/plays", {
      data: {
        name: "E2E Community Play",
        category: "offense",
        courtType: "half",
        steps: [{ tokens: [{ id: "o1", type: "offense", label: "1", x: 50, y: 90 }], drawings: [] }],
      },
    });
    const play = await create.json();
    await page.request.put(`/api/plays/${play.id}/share-community`, { data: { shared: true } });

    await page.goto("/playbook/community");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=E2E Community Play");

    await page.click('button[aria-label="Like E2E Community Play"]');
    await expect(page.locator('button[aria-label="Unlike E2E Community Play"]')).toHaveAttribute("aria-pressed", "true");

    await page.click('button[aria-label="Save E2E Community Play"]');
    await expect(page.locator('button[aria-label="Unsave E2E Community Play"]')).toHaveAttribute("aria-pressed", "true");

    await page.click('button[aria-label="View comments on E2E Community Play"]');
    await page.fill('textarea[aria-label="Add a comment…"]', "Great play!");
    await page.click('button:has-text("Post")');
    await page.waitForSelector("text=Great play!");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    await page.request.delete(`/api/plays/${play.id}`);
  });

  test("community plays page — suggested coaches row, follows from a suggestion", async ({ page }) => {
    // Suggestions are ranked account-wide (see /api/coaches/suggested), so a
    // throwaway account that only ever shared an exercise still shows up as
    // a suggestion here on the plays community page.
    const secondEmail = `e2e-suggest-play-${Date.now()}@coachhub.test`;
    await page.request.post("/api/signup", { data: { email: secondEmail, password: "e2e-test-password-123" } });
    await page.request.put("/api/account/public-name", { data: { publicName: `E2E Suggested Play Coach ${Date.now()}` } });
    // A free-plan account can't create a custom exercise, but every signup
    // is seeded with the default library — share one of those instead.
    const seeded = await (await page.request.get("/api/exercises")).json();
    await page.request.put(`/api/exercises/${seeded[0].id}/share-community`, { data: { shared: true } });

    // Switch back to the shared test account for the rest of the test.
    await page.request.post("/api/login", { data: { email: TEST_EMAIL, password: TEST_PASSWORD } });

    await login(page);
    await page.goto("/playbook/community");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=Coaches you might like to follow");
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("playbook — duplicate flow opens the copy in the editor", async ({ page }) => {
    await login(page);
    await page.goto("/playbook");
    await page.waitForLoadState("networkidle");
    await page.locator('button[aria-label^="Duplicate "]').first().click();
    await page.waitForURL(/\/playbook\/\d+$/);
    await expect(page.locator('input[aria-label="Play name"]')).toHaveValue(/\(copy\)$/);
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("playbook — filter by situation", async ({ page }) => {
    await login(page);
    await page.request.post("/api/plays", {
      data: {
        name: "E2E Situation Play",
        category: "offense",
        courtType: "half",
        situation: "press_break",
        steps: [{ tokens: [{ id: "o1", type: "offense", label: "1", x: 50, y: 90 }], drawings: [] }],
      },
    });

    await page.goto("/playbook");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Filter by situation").click();
    await page.getByRole("option", { name: "Press break" }).click();
    await page.waitForSelector("text=E2E Situation Play");
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

  test("coach settings page — sets a default session duration", async ({ page }) => {
    await login(page);
    await page.goto("/settings/coaches");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=Team Preferences");
    await page.locator("#default-session-duration").click();
    await page.click('[role="option"]:has-text("90 minutes")');
    await page.click('button:has-text("Save")');
    await page.waitForSelector("text=Preferences saved");
    // Dismiss the confirmation toast before scanning — see the comment on
    // the invite-sent test below for why (a pre-existing Radix Toast quirk).
    await page.click('button[aria-label="Close"]');
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);
  });

  test("coach settings page — sets a team logo and theme color", async ({ page }) => {
    await login(page);
    await page.goto("/settings/coaches");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=Team Preferences");

    await page.fill('input[aria-label="Team Logo"]', "https://example.com/logo.png");
    await page.click('button[aria-label="Blue"]');
    await page.click('button:has-text("Save")');
    await page.waitForSelector("text=Preferences saved");
    await expect(page.locator('button[aria-label="Blue"]')).toHaveAttribute("aria-pressed", "true");
    await page.click('button[aria-label="Close"]');
    const results = await scan(page);
    expect(summarize(results.violations)).toEqual([]);

    // Restore the default so this shared seeded account doesn't carry a
    // custom theme into unrelated tests/runs.
    await page.click('button[aria-label="Default (orange)"]');
    await page.click('button:has-text("Save")');
    await page.waitForSelector("text=Preferences saved");
  });

  test("team theme color — every preset keeps white-on-fill text at WCAG AA contrast", async ({ page }) => {
    await login(page);
    const teamsRes = await page.request.get("/api/teams");
    const teamId = (await teamsRes.json())[0].id;

    for (const color of ["blue", "green", "purple", "red", "teal"]) {
      await page.request.put(`/api/teams/${teamId}`, { data: { themeColor: color } });
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");
      const results = await scan(page);
      expect(summarize(results.violations), `theme color: ${color}`).toEqual([]);
    }

    await page.request.put(`/api/teams/${teamId}`, { data: { themeColor: null } });
  });

  test("coach settings page — downloads a team data backup", async ({ page }) => {
    await login(page);
    await page.goto("/settings/coaches");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("text=Export Backup");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.click('button:has-text("Download Backup")'),
    ]);
    expect(download.suggestedFilename()).toMatch(/^coachhub-backup-.*\.json$/);
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

  // Dialog/AlertDialog render as a bottom sheet below the sm breakpoint
  // (see ui/dialog.tsx, ui/alert-dialog.tsx) — checked at a phone-sized
  // viewport since the rest of this suite runs at desktop width and would
  // never exercise that layout.
  test.describe("mobile viewport", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("training sessions — create session as a bottom sheet", async ({ page }) => {
      await login(page);
      await page.goto("/training-sessions");
      await page.waitForLoadState("networkidle");
      await page.click('button:has-text("New Session")');
      await page.waitForSelector("text=Create Training Session");
      const results = await scan(page);
      expect(summarize(results.violations)).toEqual([]);
    });

    test("training sessions — delete confirm as a bottom sheet", async ({ page }) => {
      await login(page);
      await page.goto("/training-sessions");
      await page.waitForLoadState("networkidle");
      await page.locator('button[aria-label^="Delete"]').first().click();
      await page.waitForSelector("text=Delete training session?");
      const results = await scan(page);
      expect(summarize(results.violations)).toEqual([]);
    });

    // The bell used to be desktop-only (hidden lg:flex) — a coach on their
    // phone had no way to see who followed them or liked their exercises.
    test("notifications bell is reachable and opens the dialog", async ({ page }) => {
      await login(page);
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");
      await page.click('button[aria-label*="Notifications"]');
      await page.waitForSelector("text=Follows and likes on your published exercises.");
      const results = await scan(page);
      expect(summarize(results.violations)).toEqual([]);
    });
  });
});
