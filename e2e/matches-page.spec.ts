import { test, expect, type Page } from "@playwright/test";

/**
 * Matches page auth E2E (run via `pnpm run test:e2e:auth` with AUTH_MODE=auth
 * and a running Postgres). Verifies the dedicated /matches route inside the
 * shell (spec MP-1 / MP-4):
 *
 *  1. a signed-in user reaches /matches and, with no fixtures, sees the empty
 *     state (`matches.empty`);
 *  2. after starting a 2-team league, the user's round-robin fixture appears on
 *     /matches (a pending/scheduled fixture where the user participates).
 *
 * Leagues and fixtures are API-backed (Postgres) and every endpoint requires a
 * session, so this spec runs in the auth suite and is excluded from the default
 * local `test:e2e` config.
 */
test.use({ locale: "es-ES" });
test.setTimeout(120_000);

const uniqueEmail = () =>
  `matches-page-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
const PASSWORD = "password-123";

async function signup(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByLabel("Nombre").fill("Entrenador Partidos");
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

/** Creates a league and has `page` join it with the given team (re-join a second squad for round-robin). */
async function createLeagueAndJoin(page: Page, leagueName: string, teamName: string) {
  await page.goto("/leagues");
  await expect(page.getByRole("heading", { level: 1, name: "Mis Ligas" })).toBeVisible();
  await page.getByRole("button", { name: "+ Nueva liga" }).first().click();
  await page.getByLabel("Nombre").fill(leagueName);
  await page.getByLabel("Descripción").fill("Liga de partidos");
  await page.getByRole("button", { name: "Crear liga" }).click();
  await expect(page.getByText(leagueName)).toBeVisible();

  // Open the league detail and join with the given team.
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

test("logged user: empty /matches, then their upcoming fixture after starting a 2-team league", async ({
  page,
}) => {
  const email = uniqueEmail();
  const teamAName = "Roja Reavers";
  const teamBName = "Azul Blitzers";
  const leagueName = `Liga Matches E2E ${Date.now()}`;

  await signup(page, email);
  await createTeam(page, teamAName);
  await createTeam(page, teamBName);

  // /matches starts empty (no started league yet).
  await page.goto("/matches");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Partidos" })).toBeVisible();
  await expect(page.getByText("No tienes partidos próximos.")).toBeVisible();

  // One owner joins BOTH of their teams, then starts the league (round-robin
  // with 2 teams → a single jornada with one A-vs-B fixture the owner plays in).
  await createLeagueAndJoin(page, leagueName, teamAName);
  await createLeagueAndJoin(page, leagueName, teamBName);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Iniciar liga" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Iniciar liga" }).click();
  await expect(page.getByRole("dialog", { name: "Iniciar liga" })).toBeVisible();
  await page
    .getByRole("dialog", { name: "Iniciar liga" })
    .getByRole("button", { name: "Iniciar liga" })
    .click();
  await expect(page.getByText("Iniciada")).toBeVisible();

  // The upcoming fixture now appears on /matches (undated → "Sin programar").
  await page.goto("/matches");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Sin programar" })).toBeVisible();
  await expect(page.getByText(teamAName)).toBeVisible();
  await expect(page.getByText(teamBName)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Partidos" })).toBeVisible();
});
