import { defineConfig, devices } from "@playwright/test";
import { E2E_VERIFICATION_CODE } from "./e2e/verificationCode";

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
  forbidOnly: !!process.env.CI,
  // The suite already documents cold-start re-runs; a single retry absorbs the
  // remaining contention races (e.g. list re-render detach) without masking
  // real failures — a genuinely broken feature fails both attempts.
  retries: 1,
  reporter: [["html", { outputFolder: "playwright-report-auth" }]],
  globalSetup: "./e2e/global-setup-auth",
  // The cold-start signOut POST under 4 parallel workers can exceed 15s (dev
  // server compiles the Auth.js surface on first use). 30s only extends waits
  // when an assertion is already failing — passing assertions still resolve
  // instantly. The globalSetup warm-up removes the root cause.
  expect: { timeout: 30_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      // Most specs: unique emails/league names per run (see e2e conventions), so
      // they are safe to parallelize. CI stays at 1 worker (sharding is a later
      // step); locally up to 3 browsers share the single `next dev` process.
      name: "chromium",
      testIgnore: [
        "**/live-match.spec.ts",
        "**/live-resolution.spec.ts",
        "**/full-match-journey.spec.ts",
      ],
      fullyParallel: true,
      workers: process.env.CI ? 1 : 3,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // SSE fan-out is process-wide: the live specs must never run
      // concurrently with each other, and the resolution wizard is the heaviest
      // journey. One serial worker keeps the hub quiet.
      name: "chromium-sse-heavy",
      testMatch: [
        "**/live-match.spec.ts",
        "**/live-resolution.spec.ts",
        "**/full-match-journey.spec.ts",
      ],
      fullyParallel: false,
      workers: 1,
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
      // Fast bcrypt for e2e only (default 10 in prod): the ~130 signups/login
      // would otherwise saturate the single dev server under parallel workers.
      PASSWORD_SALT_ROUNDS: "4",
      // Same reason, and the same population: the suite signs up ~130 accounts
      // from one machine, and with no proxy in front of `next dev` clientIp()
      // resolves to the SAME key for every request — so the production cap of
      // 5 signups/hour/IP rejects everything after the 5th account. Observed
      // effect before this override: 11 of 71 specs passing.
      //
      // Production defaults are untouched (`lib/rateLimit.ts` falls back to
      // 5/10/10 when these are unset) and the 429 path stays covered by
      // `lib/rateLimit.test.ts` and the signup route test.
      AUTH_RATE_LIMIT_SIGNUP: "1000",
      AUTH_RATE_LIMIT_LOGIN: "1000",
      AUTH_RATE_LIMIT_PASSWORD_CHANGE: "1000",
      // Fixed 6-digit verification code (#197): only sha256 hashes reach the
      // DB, so the specs could not read a random code back — the app must
      // generate this known value instead (e2e/verificationCode.ts is the
      // single source shared with the specs). lib/verification.ts ignores the
      // variable when NODE_ENV=production; hash/TTL/attempts/cooldown stay real.
      E2E_VERIFICATION_CODE,
      // AUTH_SECRET falls back to .env when present; a dev default keeps CI green.
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-auth-secret-for-tests-only",
      AUTH_TRUST_HOST: "true",
    },
  },
});
