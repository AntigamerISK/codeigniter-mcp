import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The e2e spawns a Node process with tsx (SDK import) → generous margin.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
