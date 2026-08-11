import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the real-DB auth/migration/isolation E2E suites.
 *
 * Run with: `pnpm run test:e2e:auth` (which starts the docker Postgres and
 * applies the Prisma schema first). This config:
 * - runs ONLY the auth-dependent specs (they REQUIRE AUTH_MODE=auth + Postgres);
 * - boots a `next dev` server in AUTH_MODE=auth with the app DB env;
 * - keeps the default `test:e2e` config (AUTH_MODE=local) untouched so the
 *   existing 19 local e2e remain green.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "**/auth.spec.ts",
    "**/migration.spec.ts",
    "**/isolation.spec.ts",
    "**/leagues.spec.ts",
    "**/league-season.spec.ts",
    "**/league-matchday.spec.ts",
    "**/avatar.spec.ts",
    "**/match-report.spec.ts",
    "**/match-view.spec.ts",
  ],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["html", { outputFolder: "playwright-report-auth" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Apply the schema to the compose Postgres, then boot the app in auth mode.
    command: "pnpm prisma migrate deploy && pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      AUTH_MODE: "auth",
      // Published port matches docker-compose POSTGRES_PORT (default 5433).
      DATABASE_URL:
        `postgresql://bloodbowl:bloodbowl@localhost:${process.env.POSTGRES_PORT ?? "5433"}/bloodbowl?schema=public`,
      // AUTH_SECRET falls back to .env when present; a dev default keeps CI green.
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-auth-secret-for-tests-only",
      AUTH_TRUST_HOST: "true",
    },
  },
});
