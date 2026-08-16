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
