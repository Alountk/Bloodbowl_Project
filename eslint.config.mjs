import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Playwright artifacts (also gitignored; eslint ignores
    // .gitignore by default, so they must be listed here too).
    "playwright-report/**",
    "playwright-report-auth/**",
    "test-results/**",
    // Storybook static build output (also gitignored).
    "storybook-static/**",
    // Storybook CSF stories (co-located with components): linted separately by
    // Storybook's own tooling, not by the Next.js eslint config.
    "**/*.stories.@(js|jsx|ts|tsx)",
  ]),
]);

export default eslintConfig;
