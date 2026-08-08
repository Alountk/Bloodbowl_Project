import { test, expect, type Page } from "@playwright/test";

/**
 * Real-DB leagues E2E (run via `pnpm run test:e2e:auth` with AUTH_MODE=auth and a
 * running Postgres). Verifies the Pattern-2 leagues journey:
 * create league → card shows → open detail → assign an unassigned team → member
 * listed with race/players → expel the member → member leaves the detail list.
 *
 * Leagues are API-backed (Postgres) and every endpoint requires a session (401
 * unauthenticated), so this spec runs in the auth suite and is excluded from the
 * default local `test:e2e` config (which stays green with AUTH_MODE=local where
 * /api/leagues returns 401 and the list page shows the empty state).
 */

const uniqueEmail = () => `league-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

async function signup(page: Page, email: string, password: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).last().click();
  await expect(page).toHaveURL("/");
}

async function createTeam(page: Page) {
  await page.goto("/teams/create");
  await page.getByLabel("Team name").fill("Middenheim Marauders");
  await page.getByLabel("Race").selectOption("human");
  await page.getByRole("button", { name: /siguiente/i }).click();
  // Three players so the team is valid.
  await page.getByRole("button", { name: "Add Lineman" }).first().click();
  await page.getByRole("button", { name: "Add Lineman" }).first().click();
  await page.getByRole("button", { name: "Add Blitzer" }).first().click();
  await page.getByRole("button", { name: /create team/i }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Middenheim Marauders")).toBeVisible();
}

async function createLeague(page: Page, name: string) {
  await page.goto("/leagues");
  await expect(page.getByRole("heading", { name: "Mis Ligas" })).toBeVisible();
  await page.getByRole("button", { name: "+ Nueva liga" }).first().click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Descripción").fill("Liga de verano");
  await page.getByRole("button", { name: "Crear liga" }).click();
  // Card with the league name appears on the refreshed list.
  await expect(page.getByText(name)).toBeVisible();
}

test("create league → card shows → assign team → member listed → expel", async ({ page }) => {
  const email = uniqueEmail();
  const password = "password-123";
  await signup(page, email, password);

  await createTeam(page);

  const leagueName = "Costa Norte";
  await createLeague(page, leagueName);

  // Open the detail via the card's "Ver" link.
  await page.getByRole("link", { name: "Ver", exact: true }).click();
  await expect(page.getByRole("heading", { name: leagueName })).toBeVisible();
  // Description shown in the hero.
  await expect(page.getByText("Liga de verano")).toBeVisible();

  // Assign the unassigned team.
  await page.getByLabel("Equipos").selectOption({ label: "Middenheim Marauders" });
  await page.getByRole("button", { name: "Asignar" }).click();

  // The team becomes a member of the league (name + race visible).
  await expect(page.getByText("Middenheim Marauders")).toBeVisible();
  await expect(page.getByText(/\u00b7/).first()).toBeVisible();

  // Expel the team and confirm it leaves the member list.
  await page.getByRole("button", { name: "Expulsar" }).first().click();
  await expect(page.getByText("Middenheim Marauders")).not.toBeVisible();
});
