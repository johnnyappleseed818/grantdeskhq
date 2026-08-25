import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    exclude: [".worktrees/**", "scripts/**", "node_modules/**", "dist/**"],
    css: true
  }
});
