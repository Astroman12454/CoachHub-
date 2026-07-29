import type { Page } from "@playwright/test";

// The dev server is started with APP_PASSCODE=test1234 for these tests
// (see the "test:e2e" script) — never a production passcode.
export const TEST_PASSCODE = "test1234";

export async function login(page: Page) {
  await page.goto("/");
  await page.fill("#passcode", TEST_PASSCODE);
  await page.click('button:has-text("Log In")');
  await page.waitForURL(/\/(dashboard)?$/);
}
