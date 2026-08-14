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
    // Card lists animate in with the .fade-in CSS class (opacity 0 -> 1
    // over ~250ms, staggered per card) — an axe color-contrast scan that
    // lands mid-animation sees a still-transparent element and reports a
    // false-positive violation. That's the real cause behind this suite's
    // occasional "color-contrast" failures on freshly-rendered cards (seen
    // on both CommunityExercises and CommunityPlays). index.css already
    // collapses .fade-in to near-instant under prefers-reduced-motion —
    // this just makes every test actually run with that preference, which
    // both removes the race and matches how a motion-sensitive user would
    // really see the page.
    reducedMotion: "reduce",
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
