import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Allow server modules that import "server-only" to run in tests.
      "server-only": path.resolve(__dirname, "src/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
