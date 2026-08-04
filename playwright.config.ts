import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
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
