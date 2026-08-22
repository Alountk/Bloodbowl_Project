import { test, expect, type Page } from "@playwright/test";

/**
 * Matches page auth E2E (run via `pnpm run test:e2e:auth` with AUTH_MODE=auth
 * and a running Postgres). Verifies the dedicated /matches route inside the
 * shell (spec MP-1 / MP-4):
 *
 *  1. a signed-in user reaches /matches and, with no started league, sees the
 *     empty state (`matches.empty`);
 *  2. after a league with two member teams is started, each user's round-robin
 *     fixture appears on /matches (pending|scheduled where they participate).
 *
 * Leagues and fixtures are API-backed (Postgres) and every endpoint requires a
 * session, so this spec runs in the auth suite and is excluded from the default
 * local `test:e2e` config. Two browser contexts mirror the proven league flows
 * (league-season / full-league-flow) so the 2-start is deterministic.
 */
test.use({ locale: "es-ES" });
test.setTimeout(150_000);

const uniqueEmail = (prefix: string) =>
  `matches-page-${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
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

/** Opens the league detail (unique name) from the user's league list. */
async function openLeague(page: Page, leagueName: string) {
  await page.goto("/leagues");
  await expect(page.getByRole("heading", { level: 1, name: "Mis Ligas" })).toBeVisible();
  await page
    .locator("li")
    .filter({ hasText: leagueName })
    .getByRole("link", { name: "Ver", exact: true })
    .click();
  await expect(page).toHaveURL(/\/leagues\/.+$/);
  await expect(page.getByRole("heading", { name: leagueName })).toBeVisible();
}

async function joinLeague(page: Page, leagueName: string, teamName: string) {
  await expect(page.getByRole("heading", { name: leagueName })).toBeVisible();
  await page.getByLabel("Tu equipo").selectOption({ label: teamName });
  await page.getByRole("button", { name: "Apuntarse" }).click();
  await expect(page.getByText(teamName)).toBeVisible();
}

test("logged user: empty /matches, then their upcoming fixture after starting a 2-team league", async ({
  browser,
}) => {
  const contextAdmin = await browser.newContext({ locale: "es-ES" });
  const contextRival = await browser.newContext({ locale: "es-ES" });
  const admin = await contextAdmin.newPage();
  const rival = await contextRival.newPage();

  try {
    const leagueName = `Liga Matches E2E ${Date.now()}`;
    const teamAdmin = `Roja ${Date.now()}`;
    const teamRival = `Azul ${Date.now()}`;

    await signup(admin, uniqueEmail("admin"));
    await createTeam(admin, teamAdmin);

    // /matches starts empty (no started league yet) — the MP-4 empty state.
    await admin.goto("/matches");
    await admin.waitForLoadState("networkidle");
    await expect(admin.getByRole("heading", { name: "Partidos" })).toBeVisible();
    await expect(admin.getByText("No tienes partidos próximos.")).toBeVisible();

    // Owner creates the league and joins with their own team.
    await admin.goto("/leagues");
    await admin.getByRole("button", { name: "+ Nueva liga" }).first().click();
    await admin.getByLabel("Nombre").fill(leagueName);
    await admin.getByLabel("Descripción").fill("Liga de partidos");
    await admin.getByRole("button", { name: "Crear liga" }).click();
    await openLeague(admin, leagueName);
    await joinLeague(admin, leagueName, teamAdmin);

    // Rival signs up, sees the OPEN league, joins, then the owner starts it.
    await signup(rival, uniqueEmail("rival"));
    await createTeam(rival, teamRival);
    await openLeague(rival, leagueName);
    await joinLeague(rival, leagueName, teamRival);

    await admin.reload();
    await expect(admin.getByRole("button", { name: "Iniciar liga" })).toBeEnabled();
    await admin.getByRole("button", { name: "Iniciar liga" }).click();
    await expect(admin.getByRole("dialog", { name: "Iniciar liga" })).toBeVisible();
    // Round-robin with 2 teams → exactly 1 jornada (A vs B).
    await admin
      .getByRole("dialog", { name: "Iniciar liga" })
      .getByLabel("¿Cuántas jornadas?")
      .fill("1");
    await admin
      .getByRole("dialog", { name: "Iniciar liga" })
      .getByRole("button", { name: "Iniciar liga" })
      .click();
    await expect(admin.getByText("Iniciada")).toBeVisible();

    // The admin's round-robin fixture now appears on /matches (undated → "Sin
    // programar") and the empty state is gone.
    await admin.goto("/matches");
    await admin.waitForLoadState("networkidle");
    await expect(admin.getByRole("heading", { name: "Partidos" })).toBeVisible();
    await expect(admin.getByRole("heading", { name: "Sin programar" })).toBeVisible();
    await expect(admin.getByText(teamAdmin)).toBeVisible();
    await expect(admin.getByText(teamRival)).toBeVisible();
    await expect(admin.getByText("No tienes partidos próximos.")).toHaveCount(0);
  } finally {
    await contextAdmin.close();
    await contextRival.close();
  }
});
