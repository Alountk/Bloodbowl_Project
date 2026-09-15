import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["**/node_modules/**", "e2e"],
    // Vitest defaults to 5s per test, which is too tight for the heaviest
    // component tests in this suite: the wizard/league journeys fill a full
    // form and re-render large trees, and the slowest one measures ~3.5s ALONE.
    // Under the parallel load of a full run it crosses 5s and fails as
    // "Test timed out" — three different tests flaked that way (TeamList,
    // ProfilePanel, CreateTeamForm.failure) while every one of them passed in
    // isolation. 15s gives ~4x headroom over the measured worst case, which is
    // enough to absorb scheduling contention without letting a genuinely hung
    // test sit there for long.
    testTimeout: 15_000,
    // Process CSS modules so `import styles from "./x.module.css"` resolves to
    // real class names in jsdom. `non-scoped` keeps the class names as written
    // (no hashing), so test selectors like `.turn-tag` keep matching. Only
    // `.module.css` files are processed — every other CSS import stays stubbed
    // exactly as before.
    css: {
      include: [/\.module\.css$/],
      modules: { classNameStrategy: "non-scoped" },
    },
  },
});
