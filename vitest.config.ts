import { defineConfig } from "vitest/config";
import { resolve } from "path";

const srcDir = resolve(__dirname, "src");

export default defineConfig({
  resolve: {
    alias: {
      "@": srcDir,
    },
  },
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["**/node_modules/**", ".claude/**"],
    coverage: {
      provider: "v8",
      reporter: ["lcov", "text"],
    },
  },
});
