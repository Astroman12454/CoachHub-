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
    env: {
      // Read at import time by server/auth.ts; needed for server/*.test.ts
      // even though those files run in a node environment, not jsdom.
      APP_PASSCODE: "test-passcode-12345",
    },
  },
});
