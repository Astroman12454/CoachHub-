import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./client/src/test/setup.ts"],
    // e2e/ holds Playwright specs (different test runner/API) — exclude them
    // from Vitest's own discovery alongside its usual defaults.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    env: {
      // Read at import time by server/db.ts; needed for server/*.test.ts
      // even though those files run in a node environment, not jsdom.
      // Defaults to this sandbox's local dev Postgres instance — auth tests
      // use randomized emails per run so they don't collide with anything
      // created manually — but defers to a real DATABASE_URL when one's
      // already set (CI's Postgres service container, a different
      // developer's local setup) instead of overriding it unconditionally.
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://coachhub:cf2dbcfd1c2ad8f7baac861529545a93@localhost:5432/coachhub",
    },
  },
});
