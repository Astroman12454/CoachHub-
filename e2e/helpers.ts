import type { Page } from "@playwright/test";

// Fixed test account, provisioned once by e2e/global-setup.ts (not here —
// every test used to call login() itself, which meant every test run
// tripped the same login-rate-limiter a real attacker would hit).
export const TEST_EMAIL = "e2e-test@coachhub.test";
export const TEST_PASSWORD = "e2e-test-password-123";
export const AUTH_STATE_PATH = "e2e/.auth/state.json";

// The browser context already carries the session cookie from
// playwright.config.ts's storageState — this just gets past the login
// screen to somewhere authenticated.
export async function login(page: Page) {
  await page.goto("/dashboard");
}
