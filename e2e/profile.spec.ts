import { test, expect, type Page } from "@playwright/test";
test.use({ locale: "es-ES" });

/**
 * RAU-57 profile E2E (run via `pnpm run test:e2e:auth` with AUTH_MODE=auth and
 * a running Postgres). Two journeys:
 *
 *  1. change-password: signup → /profile → wrong current → clear error; a
 *     short new password → error; mismatched confirmation → error; correct
 *     current + valid new → success; the OLD password no longer logs in, the
 *     NEW one does (proves the bcrypt hash was really replaced).
 *  2. career-stats: admin + rival build a 2-member league, the admin forfeits
 *     the single fixture (walkover 2-0) which FINISHES the league — the
 *     admin's team is the champion — then /profile shows nonzero numbers:
 *     Campeonatos 1, Equipos 1, Ligas 1, Partidos 1, Victorias 1.
 *
 * Auth-only: requires the real Postgres + AUTH_MODE=auth, so it is excluded
 * from the default local `test:e2e` config and included in playwright.config.auth.ts.
 * NOTE (auth cold-start race): the first auth-suite run right after a fresh
 * boot can time out on /signup while the dev server cold-starts; a re-run is green.
 */
test.setTimeout(240_000);

const PASSWORD = "password-123";
const NEW_PASSWORD = "password-456";
const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

async function signup(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByLabel("Nombre").fill("Entrenador E2E");
  await page.getByRole("button", { name: "Registrarse" }).last().click();
  await expect(page).toHaveURL("/");
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).last().click();
  await expect(page).toHaveURL("/");
}

/** Logs out through the avatar user menu (Spanish copy). */
async function logout(page: Page) {
  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(
    page.getByRole("heading", { name: "Your league, in your pocket." }),
  ).toBeVisible();
}

/** Fills the /profile change-password form and submits. */
async function fillPasswordForm(
  page: Page,
  current: string,
  next: string,
  confirm = next,
) {
  await page.goto("/profile");
  await page.getByLabel("Contraseña actual").fill(current);
  await page.getByLabel("Nueva contraseña", { exact: true }).fill(next);
  await page.getByLabel("Confirmar nueva contraseña").fill(confirm);
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
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

async function createLeague(page: Page, name: string) {
  await page.goto("/leagues");
  await expect(page.getByRole("heading", { level: 1, name: "Mis Ligas" })).toBeVisible();
  await page.getByRole("button", { name: "+ Nueva liga" }).first().click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByRole("button", { name: "Crear liga" }).click();
  await expect(page.getByText(name)).toBeVisible();
}

/** Opens the league card named `leagueName` and joins it with `teamName`. */
async function joinLeague(page: Page, leagueName: string, teamName: string) {
  await page
    .locator("li")
    .filter({ hasText: leagueName })
    .getByRole("link", { name: "Ver", exact: true })
    .click();
  await expect(page).toHaveURL(/\/leagues\/.+$/);
  await page.getByLabel("Tu equipo").selectOption({ label: teamName });
  await page.getByRole("button", { name: "Apuntarse" }).click();
  await expect(page.getByText(teamName)).toBeVisible();
}

/** Starts a 1-jornada season from the league detail. */
async function startLeague(page: Page) {
  await page.reload();
  const startButton = page.getByRole("button", { name: "Iniciar liga" });
  await expect(startButton).toBeEnabled();
  await startButton.click();
  await expect(page.getByRole("dialog", { name: "Iniciar liga" })).toBeVisible();
  await page.getByLabel("¿Cuántas jornadas?").fill("1");
  await page
    .getByRole("dialog", { name: "Iniciar liga" })
    .getByRole("button", { name: "Iniciar liga" })
    .click();
  await expect(page.getByText("Iniciada")).toBeVisible();
  await expect(page.getByRole("region", { name: "Jornada 1" })).toBeVisible();
}

// --- Journey 1: change password -------------------------------------------------
test("change password: wrong/weak/mismatch errors → success → login with the NEW password", async ({
  page,
}) => {
  const email = uniqueEmail("pw");
  await signup(page, email);

  // Wrong current password → clear inline error, nothing changes.
  await fillPasswordForm(page, "wrong-password", NEW_PASSWORD);
  await expect(page.getByText("La contraseña actual no es correcta.")).toBeVisible();

  // New password too short → clear inline error (the signup rule).
  await fillPasswordForm(page, PASSWORD, "short");
  await expect(page.getByText("al menos 8 caracteres")).toBeVisible();

  // Confirmation mismatch → client-side error, no request.
  await fillPasswordForm(page, PASSWORD, "brand-new-pass-1", "different-confirm");
  await expect(page.getByText("Las contraseñas no coinciden")).toBeVisible();

  // Correct current + valid new → success status.
  await fillPasswordForm(page, PASSWORD, NEW_PASSWORD);
  await expect(page.getByText("Contraseña actualizada.")).toBeVisible();

  // The OLD password no longer authenticates…
  await logout(page);
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).last().click();
  await expect(page.getByText("Email o contraseña no válidos")).toBeVisible();

  // …and the NEW password does.
  await login(page, email, NEW_PASSWORD);
  await expect(page).toHaveURL("/");
});

// --- Journey 2: career stats ----------------------------------------------------
test("career stats: league + team + forfeited win → nonzero numbers on /profile", async ({
  browser,
}) => {
  const contextA = await browser.newContext({ locale: "es-ES" });
  const contextB = await browser.newContext({ locale: "es-ES" });
  const admin = await contextA.newPage();
  const rival = await contextB.newPage();
  try {
    await signup(admin, uniqueEmail("st-admin"));
    const teamA = `ST-A-${Date.now()}`;
    await createTeam(admin, teamA);
    const leagueName = `ST Liga ${Date.now()}`;
    await createLeague(admin, leagueName);
    await joinLeague(admin, leagueName, teamA);

    await signup(rival, uniqueEmail("st-rival"));
    const teamB = `ST-B-${Date.now()}`;
    await createTeam(rival, teamB);
    await rival.goto("/leagues");
    await joinLeague(rival, leagueName, teamB);

    await startLeague(admin);

    // Admin awards a walkover to their own team. This is the season's ONLY
    // fixture, so the league finishes and the admin's team becomes champion.
    const region = admin.getByRole("region", { name: "Jornada 1" });
    await region.getByRole("button", { name: "Otorgar victoria" }).click();
    const modal = admin.getByRole("dialog", {
      name: /Otorgar victoria por no presentación/,
    });
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: teamA, exact: true }).click();
    await modal.getByRole("button", { name: `Otorgar victoria a ${teamA}` }).click();
    await expect(region.getByText(/Partido 1 · Jugado/)).toBeVisible();
    await expect(admin.getByText("Jornada completa")).toBeVisible();

    // Profile now shows the nonzero career stats. Each card's first <p> is the
    // big number (value + label share the card textContent).
    await admin.goto("/profile");
    await expect(admin.getByRole("heading", { name: "Estadísticas de carrera" })).toBeVisible();
    await expect(admin.getByTestId("stat-championships").locator("p").first()).toHaveText("1");
    await expect(admin.getByTestId("stat-teams").locator("p").first()).toHaveText("1");
    await expect(admin.getByTestId("stat-leagues").locator("p").first()).toHaveText("1");
    await expect(admin.getByTestId("stat-matches").locator("p").first()).toHaveText("1");
    await expect(admin.getByTestId("stat-wdl")).toHaveText(
      /Victorias 1 · Empates 0 · Derrotas 0/,
    );
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
