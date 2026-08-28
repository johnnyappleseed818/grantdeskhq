import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    exclude: ["scripts/gtm/**", "node_modules/**", "dist/**", ".worktrees/**"],
    css: true
  }
});
