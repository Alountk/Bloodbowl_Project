import { test, expect, type Page } from "@playwright/test";

/**
 * Landing + dashboard behavior E2E (RAU-55, AUTH_MODE=auth + real Postgres).
 *
 * Pins the product behavior:
 * - anonymous users hitting "/" get the public Landing (no redirect to /login),
 *   and protected pages still redirect;
 * - logged-in users hitting "/" get the classic Dashboard (welcome + teams +
 *   leagues);
 * - logout lands back on the Landing.
 */

const uniqueEmail = () => `landing-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

async function signup(page: Page, email: string, password: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByLabel("Name").fill("E2E Coach");
  await page.getByRole("button", { name: "Sign up" }).last().click();
  await expect(page).toHaveURL("/");
}

async function createTeam(page: Page, name: string) {
  await page.goto("/teams/create");
  await page.getByLabel("Team name", { exact: true }).fill(name);
  await page.getByLabel("Race").selectOption("human");
  await page.getByRole("button", { name: "Next →" }).click();
  const addLineman = page.getByRole("button", { name: "Add Human Lineman" }).first();
  for (let i = 0; i < 11; i++) await addLineman.click();
  await page.getByRole("button", { name: /create team/i }).click();
  await expect(page).toHaveURL("/");
}

async function createLeague(page: Page, name: string) {
  await page.goto("/leagues");
  await page.getByRole("button", { name: "+ New league" }).first().click();
  await page.getByLabel("Name").fill(name);
  // exact: the modal backdrop's aria-label is "Close create league" in en.
  await page.getByRole("button", { name: "Create league", exact: true }).click();
  await expect(page.getByText(name)).toBeVisible();
}

/** Logs out through the avatar user menu in the unified nav. */
async function logout(page: Page) {
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
}

test.describe("Landing for anonymous users (auth mode)", () => {
  test("GET / renders the public landing instead of redirecting to /login", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "Your league, in your pocket." }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign up free" })).toBeVisible();
    // "Sign in" is a button that opens the auth modal (no /login navigation).
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("the collapsible How it works toggles with Hide/Show", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
    await expect(
      page.getByText("Pick a race from the BB2025 catalog, spend your 1M treasury, name your squad."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Hide" }).click();
    await expect(
      page.getByText("Pick a race from the BB2025 catalog, spend your 1M treasury, name your squad."),
    ).not.toBeVisible();

    await page.getByRole("button", { name: "Show" }).click();
    await expect(
      page.getByText("Pick a race from the BB2025 catalog, spend your 1M treasury, name your squad."),
    ).toBeVisible();
  });

  test("protected pages still redirect to /login for anonymous users", async ({ page }) => {
    await page.goto("/teams");
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/leagues");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("Dashboard for logged-in users (auth mode)", () => {
  test("signup lands on the dashboard; teams and leagues show; logout returns to the landing", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "password-123";
    await signup(page, email, password);

    // Dashboard chrome.
    await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
    await expect(page.getByLabel("Overview")).toBeVisible();
    await expect(page.getByLabel("Quick actions").getByRole("link", { name: "Create team" })).toBeVisible();
    await expect(page.getByLabel("Quick actions").getByRole("link", { name: "Create league" })).toBeVisible();

    // My teams (TeamList embedded).
    const teamName = "Landing Reavers";
    await createTeam(page, teamName);
    await expect(page.getByText(teamName)).toBeVisible();

    // My leagues (reused league card) after creating a league.
    const leagueName = `Landing Liga ${Date.now()}`;
    await createLeague(page, leagueName);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "My Leagues" })).toBeVisible();
    await expect(page.getByText(leagueName)).toBeVisible();

    // Logout → the public landing, no dashboard/team data visible.
    await logout(page);
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "Your league, in your pocket." }),
    ).toBeVisible();
    await expect(page.getByText(teamName)).not.toBeVisible();
    await expect(page.getByText(leagueName)).not.toBeVisible();
  });
});

test.describe("Auth modal (auth mode)", () => {
  test("signup and login happen inside the modal from the landing; the user menu logs out", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "password-123";

    // Anonymous landing: the nav "Sign in" opens the modal in place (no /login).
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL("/");

    // Switch to the Sign up tab and create the account inside the modal.
    await dialog.getByRole("button", { name: "Sign up" }).first().click();
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByLabel("Password").fill(password);
    await dialog.getByLabel("Name").fill("E2E Coach");
    await dialog.getByRole("button", { name: "Sign up" }).last().click();

    // Signed in → the dashboard renders.
    await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();

    // The avatar user menu logs out back to the landing.
    await logout(page);
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "Your league, in your pocket." }),
    ).toBeVisible();

    // Log back in through the modal.
    await page.getByRole("button", { name: "Sign in" }).click();
    const loginDialog = page.getByRole("dialog");
    await loginDialog.getByLabel("Email").fill(email);
    await loginDialog.getByLabel("Password").fill(password);
    await loginDialog.getByRole("button", { name: "Log in" }).last().click();
    await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  });

  test("/login deep link mounts the same auth modal", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("dialog", { name: "Log in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });
});
