import { test, expect, type Page } from "@playwright/test";

/**
 * Real-DB auth E2E (run via `pnpm run test:e2e:auth` with AUTH_MODE=auth and a
 * running Postgres). Verifies the full signed-in journey:
 * signup → create team → reload (DB-persisted) → logout → login → team persists.
 */

/** Unique email per run so a persisted Postgres never collides across runs. */
const uniqueEmail = () => `user-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

async function signup(page: Page, email: string, password: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();
  // Successful signup establishes a session and lands on `/`.
  await expect(page).toHaveURL("/");
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
}

async function createTeam(page: Page, name: string) {
  await page.goto("/teams/create");
  await page.getByLabel("Team name").fill(name);
  await page.getByLabel("Race").selectOption("human");
  await page.getByRole("button", { name: /siguiente/i }).click();
  // A couple of players so the team is valid (3+ players required).
  await page.getByRole("button", { name: "Add Lineman" }).first().click();
  await page.getByRole("button", { name: "Add Lineman" }).first().click();
  await page.getByRole("button", { name: "Add Blitzer" }).first().click();
  await page.getByRole("button", { name: /create team/i }).click();
  // Redirect home and show the saved team.
  await expect(page).toHaveURL("/");
  await expect(page.getByText(name)).toBeVisible();
}

test.describe("Auth E2E (real Postgres)", () => {
  test("signup → create team → reload → logout → login (team persists)", async ({ page }) => {
    const email = uniqueEmail();
    const password = "password-123";

    await signup(page, email, password);

    const teamName = "Reikland Reavers";
    await createTeam(page, teamName);

    // Reload home: the team must come from the DB (not localStorage), so it is
    // still present after a full navigation.
    await page.reload();
    await expect(page.getByText(teamName)).toBeVisible();

    // Logout lands on /login and no longer shows the team (session cleared).
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(teamName)).not.toBeVisible();

    // Log back in with the same account: the team is still there from the DB.
    await login(page, email, password);
    await expect(page.getByText(teamName)).toBeVisible();
  });
});
