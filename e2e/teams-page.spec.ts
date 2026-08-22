import { test, expect, type Page } from "@playwright/test";

/**
 * Teams page auth E2E (run via `pnpm run test:e2e:auth` with AUTH_MODE=auth and a
 * running Postgres). Verifies the dedicated /teams route inside the shell
 * (spec TP-1 / TP-2):
 *
 *  1. a signed-in user reaches /teams and their unassigned team renders under
 *     the "Sin liga" section;
 *  2. after joining a league, the same team renders under "En liga" with its
 *     resolved league badge.
 *
 * Teams and leagues are API-backed (Postgres) and every endpoint requires a
 * session, so this spec runs in the auth suite and is excluded from the default
 * local `test:e2e` config.
 */
test.use({ locale: "es-ES" });
test.setTimeout(120_000);

const uniqueEmail = () =>
  `teams-page-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
const PASSWORD = "password-123";

async function signup(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByLabel("Nombre").fill("Entrenador Equipos");
  await page.getByRole("button", { name: "Registrarse" }).last().click();
  await expect(page).toHaveURL("/");
}

async function createTeam(page: Page, name: string) {
  await page.goto("/teams/create");
  await page.getByLabel("Nombre del equipo").fill(name);
  await page.getByLabel("Raza").selectOption("human");
  await page.getByRole("button", { name: "Siguiente →" }).click();
  const addLineman = page.getByRole("button", { name: "Añadir Human Lineman" }).first();
  for (let i = 0; i < 11; i++) await addLineman.click();
  await page.getByRole("button", { name: /crear equipo/i }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText(name)).toBeVisible();
}

async function createLeagueAndJoin(page: Page, leagueName: string, teamName: string) {
  await page.goto("/leagues");
  await expect(page.getByRole("heading", { level: 1, name: "Mis Ligas" })).toBeVisible();
  await page.getByRole("button", { name: "+ Nueva liga" }).first().click();
  await page.getByLabel("Nombre").fill(leagueName);
  await page.getByLabel("Descripción").fill("Liga de equipos");
  await page.getByRole("button", { name: "Crear liga" }).click();
  await expect(page.getByText(leagueName)).toBeVisible();

  // Open the league detail and join with the just-created team.
  await page
    .locator("li")
    .filter({ hasText: leagueName })
    .getByRole("link", { name: "Ver", exact: true })
    .click();
  await expect(page).toHaveURL(/\/leagues\/.+$/);
  await expect(page.getByRole("heading", { name: leagueName })).toBeVisible();
  await page.getByLabel("Tu equipo").selectOption({ label: teamName });
  await page.getByRole("button", { name: "Apuntarse" }).click();
  await expect(page.getByText(teamName)).toBeVisible();
}

test("logged user: /teams shows the team under Sin liga, then En liga with its badge", async ({
  page,
}) => {
  const email = uniqueEmail();
  const teamName = "Reikland Reavers";
  // Unique league name per run so the auth suite is idempotent.
  const leagueName = `Liga Teams E2E ${Date.now()}`;

  await signup(page, email);
  await createTeam(page, teamName);

  // The unassigned team appears under the "Sin liga" section of /teams.
  await page.goto("/teams");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Sin liga" })).toBeVisible();
  await expect(page.getByText(teamName)).toBeVisible();
  // The assigned section is hidden while the team is unassigned.
  await expect(page.getByRole("heading", { name: "En liga" })).not.toBeVisible();

  // Join a league: the team now belongs to it.
  await createLeagueAndJoin(page, leagueName, teamName);

  // Back on /teams the team moves to the "En liga" section with its badge.
  await page.goto("/teams");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "En liga" })).toBeVisible();
  await expect(page.getByText(teamName)).toBeVisible();
  await expect(page.getByText(leagueName)).toBeVisible();
});
