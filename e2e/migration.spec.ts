import { test, expect, type Page } from "@playwright/test";

/**
 * Real-DB migration E2E (run via `pnpm run test:e2e:auth`). Verifies the one-time
 * per-browser localStorage `bb_teams_v1` → account migration:
 * seed legacy teams before login → after login they appear in the account and
 * `bb_teams_migrated_v1` is set → a later login does not duplicate them.
 */

const uniqueEmail = () => `mig-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

const LEGACY_KEY = "bb_teams_v1";
const FLAG_KEY = "bb_teams_migrated_v1";

/** A legacy team whose shape matches what the migration POSTs to /api/teams. */
function legacyTeam(id: string, name: string) {
  return {
    id,
    name,
    raceId: "human",
    leagueType: "open",
    roster: [
      { id: `${id}-p1`, name: "Player 1", positionalKey: "lineman" },
      { id: `${id}-p2`, name: "Player 2", positionalKey: "blitzer" },
      { id: `${id}-p3`, name: "Player 3", positionalKey: "lineman" },
    ],
    coaching: { rerolls: 1, dedicatedFans: 1, assistantCoaches: 0, cheerleaders: 0, apothecary: false },
  };
}

async function signup(page: Page, email: string, password: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL("/");
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
}

/** Seeds legacy bbo teams into localStorage from the given (non-home) page context. */
async function seedLegacyTeams(page: Page) {
  await page.evaluate(({ key, teams }) => {
    window.localStorage.setItem(key, JSON.stringify(teams));
  }, {
    key: LEGACY_KEY,
    teams: [legacyTeam("legacy-1", "Legacy Reavers"), legacyTeam("legacy-2", "Legacy Orcs")],
  });
}

test.describe("localStorage migration E2E (real Postgres)", () => {
  test("legacy teams are migrated into the account on first login and run only once", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "password-123";
    // Create the account but do NOT log in yet.
    await signup(page, email, password);
    // Sign out so we can seed localStorage before the migration-triggering login.
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // Seed legacy teams BEFORE logging in; the migration must pick these up.
    await seedLegacyTeams(page);
    await login(page, email, password);

    // After login the migration POSTed both teams into the account.
    await expect(page.getByText("Legacy Reavers")).toBeVisible();
    await expect(page.getByText("Legacy Orcs")).toBeVisible();
    // The flag is set and the legacy copy is retained (never cleared).
    const flag = await page.evaluate((k) => window.localStorage.getItem(k), FLAG_KEY);
    expect(flag).toBe("1");
    const retained = await page.evaluate((k) => window.localStorage.getItem(k), LEGACY_KEY);
    expect(retained).not.toBeNull();

    // A later login must NOT duplicate the migrated teams (idempotent).
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await login(page, email, password);
    await expect(page.getByText("Legacy Reavers")).toHaveCount(1);
  });
});
