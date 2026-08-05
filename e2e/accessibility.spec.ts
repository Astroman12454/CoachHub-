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
  test("login page", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
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

  test("training sessions — delete confirm dialog open", async ({ page }) => {
    await login(page);
    await page.goto("/training-sessions");
    await page.waitForLoadState("networkidle");
    await page.locator('button[aria-label^="Delete"]').first().click();
    await page.waitForSelector("text=Delete training session?");
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
