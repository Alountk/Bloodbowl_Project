import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
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
        "**/migration.spec.ts",
        "**/isolation.spec.ts",
        "**/leagues.spec.ts",
        "**/league-season.spec.ts",
        "**/league-matchday.spec.ts",
        "**/avatar.spec.ts",
        "**/match-report.spec.ts",
        "**/full-league-flow.spec.ts",
        "**/match-view.spec.ts",
        "**/live-match.spec.ts",
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
    timeout: 30_000,
  },
});