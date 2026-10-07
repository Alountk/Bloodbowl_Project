import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A run that goes green on a retry is NOT a clean green — check the
  // first-attempt result in the HTML report (trace: on-first-retry keeps the
  // evidence). Retries only absorb dev-server contention; a genuinely broken
  // flow fails every attempt.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: [
        "**/mobile.spec.ts",
        "**/auth.spec.ts",
        "**/landing-dashboard.spec.ts",
        "**/migration.spec.ts",
        "**/isolation.spec.ts",
        "**/leagues.spec.ts",
        "**/league-season.spec.ts",
        "**/league-matchday.spec.ts",
        "**/avatar.spec.ts",
        "**/match-report.spec.ts",
        "**/full-league-flow.spec.ts",
        "**/roster-table.spec.ts",
        "**/hire-fire.spec.ts",
        "**/match-view.spec.ts",
        "**/live-match.spec.ts",
        "**/live-resolution.spec.ts",
        "**/full-match-journey.spec.ts",
        "**/inducement-purchase.spec.ts",
        "**/rulesets.spec.ts",
        "**/profile.spec.ts",
        "**/locale.spec.ts",
        "**/teams-page.spec.ts",
        "**/matches-page.spec.ts",
        "**/watch.spec.ts",
      ],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testMatch: "**/mobile.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // Cold Turbopack boot on a CI runner regularly eats the default 30s
    // budget; the auth config allows 60s for the same reason.
    timeout: 60_000,
    // This file IS the AUTH_MODE=local suite, so pin the mode rather than
    // inherit whatever the shell has. AUTH_SECRET is required for Auth.js to
    // answer `/api/auth/session`: with it missing that endpoint 500s and every
    // spec asserting a clean console fails. CI checks out no `.env`, so the
    // test-only fallback below is what keeps the gate green there.
    env: {
      AUTH_MODE: "local",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "local-e2e-secret-for-tests-only",
      AUTH_TRUST_HOST: "true",
    },
  },
});