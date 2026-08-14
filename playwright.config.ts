import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // CI's runner is more resource-constrained than a local machine, so the
  // occasional test that's genuinely just timing-sensitive under load (not
  // actually broken — verified by rerunning it standalone) needs a little
  // retry margin there. Locally, a failure should still fail on the first
  // try so it's obvious while iterating.
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:5000",
    trace: "retain-on-failure",
    storageState: "e2e/.auth/state.json",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5000",
    reuseExistingServer: true,
    timeout: 30_000,
    env: {
      NODE_ENV: "development",
    },
  },
});
