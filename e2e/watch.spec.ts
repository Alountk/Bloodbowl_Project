import { test, expect, type Page } from "@playwright/test";
test.use({ locale: "es-ES" });

/**
 * Public share-link E2E (MSL-6). Real-DB auth suite (run via
 * `pnpm run test:e2e:auth` with AUTH_MODE=auth + Postgres). Proves end-to-end:
 *
 *  1. a participant mints a stable share token via the share endpoint;
 *  2. a GUEST (fresh, unauthenticated browser context) opens `/watch/[token]`
 *     and sees both teams with NO member chrome (no "Main navigation");
 *  3. once the fixture is played (walkover), the same link collapses to the
 *     SAME generic 404 copy as the server ("Este link ya no está disponible").
 *
 * Same idempotent pattern as match-view/live-match: unique users, teams and
 * league per run; the share token, fixture lookup and walkover are driven via
 * the authenticated `request` API.
 */
test.setTimeout(240_000);

const PASSWORD = "password-123";
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

async function createTeam(page: Page, name: string, playerCount = 11) {
  await page.goto("/teams/create");
  await page.getByLabel("Nombre del equipo").fill(name);
  await page.getByLabel("Raza").selectOption("human");
  await page.getByRole("button", { name: "Siguiente →" }).click();
  const add = page.getByRole("button", { name: "Añadir Human Lineman" }).first();
  for (let i = 0; i < playerCount; i++) await add.click();
  const nameInputs = page.getByLabel(/Nombre del jugador para /);
  for (let i = 0; i < playerCount; i++) {
    await nameInputs.nth(i).fill(`Player ${i + 1}`);
  }
  await page.getByRole("button", { name: /crear equipo/i }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText(name)).toBeVisible();
}

async function createLeague(page: Page, name: string, tag: string) {
  await page.goto("/leagues");
  await page.getByRole("button", { name: "+ Nueva liga" }).first().click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Descripción").fill(`Liga share ${tag}`);
  await page.getByRole("button", { name: "Crear liga" }).click();
  await expect(page.getByText(name)).toBeVisible();
}

async function openLeagueCard(page: Page, leagueName: string): Promise<string> {
  await page
    .locator("li")
    .filter({ hasText: leagueName })
    .getByRole("link", { name: "Ver", exact: true })
    .click();
  await expect(page).toHaveURL(/\/leagues\/.+$/);
  return page.url();
}

/** The league's single fixture identity (2-member league → one fixture). */
async function fixtureOf(
  page: Page,
  leagueId: string,
): Promise<{ id: string; homeTeamId: string; awayTeamId: string }> {
  const res = await page.request.get(`/api/leagues/${leagueId}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    fixtures: { id: string; homeTeamId: string; awayTeamId: string }[];
  };
  expect(body.fixtures.length).toBeGreaterThan(0);
  return body.fixtures[0];
}

test.describe("public match share link", () => {
  test("a guest opens the shared link and a played fixture returns the generic 404", async ({
    browser,
  }) => {
    const contextA = await browser.newContext({ locale: "es-ES" });
    const contextB = await browser.newContext({ locale: "es-ES" });
    const admin = await contextA.newPage();
    const rival = await contextB.newPage();
    let guestContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;

    try {
      // 1. A started 2-member league with one fixture.
      const teamAName = `VA-share ${Date.now()}`;
      await signup(admin, uniqueEmail("share-admin"));
      await createTeam(admin, teamAName);
      const leagueName = `Share Liga ${Date.now()}`;
      await createLeague(admin, leagueName, "share");
      const leagueUrl = await openLeagueCard(admin, leagueName);
      const leagueId = /\/leagues\/(.+)$/.exec(leagueUrl)?.[1] as string;
      expect(leagueId).toBeDefined();
      await admin.getByLabel("Tu equipo").selectOption({ label: teamAName });
      await admin.getByRole("button", { name: "Apuntarse" }).click();
      await expect(admin.getByText(teamAName)).toBeVisible();

      const teamBName = `VB-share ${Date.now()}`;
      await signup(rival, uniqueEmail("share-rival"));
      await createTeam(rival, teamBName);
      await rival.goto("/leagues");
      await openLeagueCard(rival, leagueName);
      await rival.getByLabel("Tu equipo").selectOption({ label: teamBName });
      await rival.getByRole("button", { name: "Apuntarse" }).click();
      await expect(rival.getByText(teamBName)).toBeVisible();

      await admin.reload();
      await admin.getByRole("button", { name: "Iniciar liga" }).click();
      await admin.getByLabel("¿Cuántas jornadas?").fill("1");
      await admin
        .getByRole("dialog", { name: "Iniciar liga" })
        .getByRole("button", { name: "Iniciar liga" })
        .click();
      await expect(admin.getByText("Iniciada")).toBeVisible();

      const fixture = await fixtureOf(admin, leagueId);

      // 2. A participant mints the share token (idempotent).
      const shareRes = await admin.request.post(
        `/api/leagues/${leagueId}/fixtures/${fixture.id}/share`,
      );
      expect(shareRes.status()).toBe(200);
      const { token } = (await shareRes.json()) as { token: string };
      expect(token.length).toBeGreaterThan(0);

      // 3. A GUEST (fresh, unauthenticated context) opens the public link.
      guestContext = await browser.newContext({ locale: "es-ES" });
      const guest = await guestContext.newPage();
      await guest.goto(`/watch/${token}`);
      await expect(guest.getByText(teamAName)).toBeVisible();
      await expect(guest.getByText(teamBName)).toBeVisible();
      await expect(guest.getByText("Compartido")).toBeVisible();
      // MSL-6/AS-9: the member chrome is NOT mounted on the public share page.
      await expect(guest.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);

      // 4. The owner awards a walkover → the fixture is played → the link expires.
      const forfeit = await admin.request.post(
        `/api/leagues/${leagueId}/fixtures/${fixture.id}/forfeit`,
        { data: { winnerTeamId: fixture.homeTeamId } },
      );
      expect(forfeit.status()).toBe(200);

      // The public API returns the SAME generic 404 for the now-played link.
      const gone = await guest.request.get(`/api/watch/${token}`);
      expect(gone.status()).toBe(404);
      expect(((await gone.json()) as { error: string }).error).toBe(
        "Este link ya no está disponible",
      );

      // And the guest page collapses to the identical copy after a reload.
      await guest.reload();
      await expect(guest.getByRole("alert")).toHaveText("Este link ya no está disponible");
    } finally {
      await guestContext?.close();
      await contextA.close();
      await contextB.close();
    }
  });
});
