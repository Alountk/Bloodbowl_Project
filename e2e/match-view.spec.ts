import { test, expect, type Page, type Browser } from "@playwright/test";
test.use({ locale: "es-ES" });

/**
 * Real-DB match-view E2E journeys (run via `pnpm run test:e2e:auth` with
 * AUTH_MODE=auth and a running Postgres). This is the final live-match slice
 * (MV-1..MV-4, AC-1..AC-3) and proves end-to-end on a real database:
 *
 *  1. pending → scheduled → played on one 2-member league: the match view page
 *     ALWAYS offers the two-phase consent start ("Partido sin programar" when no
 *     date is agreed — the negotiation is an optional reminder, never a gate),
 *     then "Partido programado" once a date is agreed, then the played summary
 *     (scoreboard + winner, teams with race + coach, dedicated fans, winnings,
 *     weather, +4 MVP row) once a result is loaded.
 *  2. walkover (own 2-member league): the owner forfeits via the API → the match
 *     view shows the fixture scores + "Victoria por incomparecencia." with zero
 *     summary sections.
 *  3. Jornadas navigation (MV-4): the region's first two links are still the
 *     team scouting links and the LAST link is "Ver partido", which navigates to
 *     the match page (the "Ver partido" link must not break the Jornadas
 *     `fixturesTeamNames` destructuring).
 *
 * Same idempotent pattern as league-matchday/match-report: unique users, teams,
 * and league per run; scheduling and forfeit are driven via the authenticated
 * `request` API, the result through the real ResultModal.
 */
test.setTimeout(240_000);

const PASSWORD = "password-123";
const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

async function signup(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
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
  // Normalize the auto-generated fantasy names to deterministic "Player N" so
  // later steps can address players by a stable name.
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
  await expect(page.getByRole("heading", { level: 1, name: "Mis Ligas" })).toBeVisible();
  await page.getByRole("button", { name: "+ Nueva liga" }).first().click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Descripción").fill(`Liga match-view ${tag}`);
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

interface TwoMemberLeague {
  admin: Page;
  rival: Page;
  leagueId: string;
  teamAName: string;
  teamBName: string;
}

/** Builds a started 2-member league: one jornada, one fixture A×B. */
async function buildTwoMemberStartedLeague(
  browser: Browser,
  tag: string,
): Promise<TwoMemberLeague> {
  const contextA = await browser.newContext({ locale: "es-ES" });
  const contextB = await browser.newContext({ locale: "es-ES" });
  const admin = await contextA.newPage();
  const rival = await contextB.newPage();

  try {
    await signup(admin, uniqueEmail(`mv-admin-${tag}`));
    const teamAName = `VA-${tag} ${Date.now()}`;
    await createTeam(admin, teamAName);
    const leagueName = `MV Liga ${tag} ${Date.now()}`;
    await createLeague(admin, leagueName, tag);
    const leagueUrl = await openLeagueCard(admin, leagueName);
    const leagueId = /\/leagues\/(.+)$/.exec(leagueUrl)?.[1];
    expect(leagueId).toBeDefined();
    await admin.getByLabel("Tu equipo").selectOption({ label: teamAName });
    await admin.getByRole("button", { name: "Apuntarse" }).click();
    await expect(admin.getByText(teamAName)).toBeVisible();

    await signup(rival, uniqueEmail(`mv-rival-${tag}`));
    const teamBName = `VB-${tag} ${Date.now()}`;
    await createTeam(rival, teamBName);
    await rival.goto("/leagues");
    await openLeagueCard(rival, leagueName);
    await rival.getByLabel("Tu equipo").selectOption({ label: teamBName });
    await rival.getByRole("button", { name: "Apuntarse" }).click();
    await expect(rival.getByText(teamBName)).toBeVisible();

    await admin.reload();
    await expect(admin.getByRole("heading", { name: leagueName })).toBeVisible();
    const startButton = admin.getByRole("button", { name: "Iniciar liga" });
    await expect(startButton).toBeEnabled();
    await startButton.click();
    await expect(admin.getByRole("dialog", { name: "Iniciar liga" })).toBeVisible();
    await admin.getByLabel("¿Cuántas jornadas?").fill("1");
    await admin
      .getByRole("dialog", { name: "Iniciar liga" })
      .getByRole("button", { name: "Iniciar liga" })
      .click();
    await expect(admin.getByText("Iniciada")).toBeVisible();
    await expect(admin.getByRole("region", { name: "Jornada 1" })).toBeVisible();

    return { admin, rival, leagueId: leagueId as string, teamAName, teamBName };
  } catch (error) {
    await contextA.close();
    await contextB.close();
    throw error;
  }
}

/** Reads the league's single fixture id (2-member league → one fixture). */
async function fixtureIdOf(page: Page, leagueId: string): Promise<string> {
  const res = await page.request.get(`/api/leagues/${leagueId}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { fixtures: { id: string; status: string; homeTeamId: string; awayTeamId: string }[] };
  expect(body.fixtures.length).toBeGreaterThan(0);
  return body.fixtures[0].id;
}

/** Schedules the fixture via API: rival proposes, admin (participant) accepts. */
async function scheduleFixture(league: TwoMemberLeague): Promise<string> {
  const { admin, rival, leagueId } = league;
  const fixtureId = await fixtureIdOf(admin, leagueId);
  const proposal = await rival.request.post(
    `/api/leagues/${leagueId}/fixtures/${fixtureId}/propose`,
    { data: { date: new Date(Date.now() + 10 * 86400_000).toISOString() } },
  );
  expect(proposal.status()).toBe(200);
  const prop = (await proposal.json()) as { id: string };
  const accepted = await admin.request.post(
    `/api/leagues/${leagueId}/fixtures/${fixtureId}/accept`,
    { data: { proposalId: prop.id } },
  );
  expect(accepted.status()).toBe(200);
  return fixtureId;
}

/** Polls the API until the fixture reaches a status (the result POST commits async). */
async function waitForFixtureStatus(page: Page, leagueId: string, fixtureId: string, status: string) {
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/leagues/${leagueId}`);
        if (res.status() !== 200) return null;
        const body = (await res.json()) as { fixtures: { id: string; status?: string }[] };
        return body.fixtures.find((f) => f.id === fixtureId)?.status ?? null;
      },
      { timeout: 20_000 },
    )
    .toBe(status);
}

/** Loads a score–0 win for the admin team through the real ResultModal. */
async function loadResultViaModal(page: Page, adminTeamName: string, rivalTeamName: string, score: number) {
  await page.getByRole("button", { name: "Cargar resultado" }).first().click();
  const dialog = page.getByRole("dialog", { name: /Cargar resultado/ });
  await expect(dialog).toBeVisible();

  const adminSection = dialog.getByLabel(`Resultado ${adminTeamName}`);
  const rivalSection = dialog.getByLabel(`Resultado ${rivalTeamName}`);
  await adminSection.getByLabel(`Goles ${adminTeamName}`).fill(String(score));
  await rivalSection.getByLabel(`Goles ${rivalTeamName}`).fill("0");
  await adminSection.getByLabel("Anotaciones Player 1", { exact: true }).fill(String(score));
  for (const section of [adminSection, rivalSection]) {
    for (let i = 1; i <= 6; i++) {
      await section
        .getByLabel(`MVP ${i} ${section === adminSection ? adminTeamName : rivalTeamName}`)
        .selectOption({ index: i });
    }
  }
  await dialog.getByRole("button", { name: "Guardar resultado" }).click();
  await expect(dialog).not.toBeVisible();
}

/** Forfeits the fixture via API (owner only), awarding the HOME team the walkover. */
async function forfeitFixtureViaApi(page: Page, leagueId: string, fixtureId: string) {
  const res = await page.request.get(`/api/leagues/${leagueId}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { fixtures: { id: string; homeTeamId: string }[] };
  const fixture = body.fixtures.find((f) => f.id === fixtureId);
  expect(fixture).toBeDefined();
  const forfeit = await page.request.post(
    `/api/leagues/${leagueId}/fixtures/${fixtureId}/forfeit`,
    { data: { winnerTeamId: fixture!.homeTeamId } },
  );
  expect(forfeit.status()).toBe(200);
}

test("match view: pending → scheduled date → played summary, and Ver partido navigates (Jornadas intact)", async ({
  browser,
}) => {
  const league = await buildTwoMemberStartedLeague(browser, "seq");
  try {
    const { admin, leagueId, teamAName, teamBName } = league;
    const fixtureId = await fixtureIdOf(admin, leagueId);
    const matchUrl = `/leagues/${leagueId}/fixtures/${fixtureId}`;

    // --- Pending: no agreed date, but the start is ALWAYS available ---
    await admin.goto(matchUrl);
    await expect(admin.getByText(/Partido sin programar/)).toBeVisible();
    await expect(admin.getByRole("button", { name: "Iniciar partido" })).toBeVisible();
    await expect(admin.getByText(/Programado:/)).toBeHidden();

    // --- Jornadas intact: first two links are still the team scouting links,
    //     and "Ver partido" is the LAST link (MV-4 / fixturesTeamNames). ---
    await admin.goto(`/leagues/${leagueId}`);
    const region = admin.getByRole("region", { name: "Jornada 1" });
    await expect(region).toBeVisible(); // fixtures load async after the page fetch
    const links = region.getByRole("link");
    await expect(links.first()).toBeVisible(); // a first team link must appear
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(3);
    const names: string[] = [];
    for (let i = 0; i < count; i++) names.push(((await links.nth(i).textContent())?.trim() ?? ""));
    // first two = the two team scouting links; the team names are the map keys.
    expect([teamAName, teamBName]).toContain(names[0]);
    expect([teamAName, teamBName]).toContain(names[1]);
    // the LAST link is "Ver partido" with the match-page href.
    expect(names[names.length - 1]).toBe("Ver partido");
    await expect(links.last()).toHaveAttribute("href", matchUrl);

    // Clicking "Ver partido" navigates to the match page.
    await links.last().click();
    await expect(admin).toHaveURL(matchUrl);

    // --- Scheduled: after both agree a date, the consent panel header flips to
    //     "Partido programado" (the negotiation is informational, not a gate) ---
    await scheduleFixture(league);
    await admin.goto(matchUrl);
    await expect(admin.getByText(/Partido programado/)).toBeVisible();
    await expect(admin.getByText(/Partido sin programar/)).toBeHidden();

    // --- Played: load the result, then the page renders the full summary. ---
    await admin.goto(`/leagues/${leagueId}`);
    await loadResultViaModal(admin, teamAName, teamBName, 2);
    await waitForFixtureStatus(admin, leagueId, fixtureId, "played");
    await admin.goto(matchUrl);

    // Scoreboard: the winning team name appears (winner + teams + header).
    await expect(admin.getByText(teamAName).first()).toBeVisible();
    // Teams + coach rows.
    await expect(admin.getByText(teamBName).first()).toBeVisible();
    // Dedicated fans (postFf) + winnings are always persisted for a loaded
    // result (omit-if-empty only hides genuinely absent fields).
    await expect(admin.getByText(/Afición/)).toBeVisible();
    await expect(admin.getByText(/Ganancias/)).toBeVisible();
    // The +4 PE MVP row renders (the MJP grantee badge).
    await expect(admin.getByText(/\+4 PE/).first()).toBeVisible();
    // Weather is omit-if-empty: the ResultModal does not capture it, so the
    // section stays hidden (never a placeholder) — covered by the unit mapper.
    await expect(admin.getByText(/Clima/)).toBeHidden();
    // No live/timeline shell placeholder.
    await expect(admin.locator("body")).not.toContainText(/turno|minuto|½/i);
  } finally {
    await league.admin.context().close();
    await league.rival.context().close();
  }
});

test("match view: walkover shows fixture scores + Victoria por incomparecencia.", async ({
  browser,
}) => {
  const league = await buildTwoMemberStartedLeague(browser, "wo");
  try {
    const { admin, leagueId } = league;
    const fixtureId = await fixtureIdOf(admin, leagueId);
    await forfeitFixtureViaApi(admin, leagueId, fixtureId);
    // Abandon the current page state; navigate fresh to the walked fixture.
    await admin.goto(`/leagues/${leagueId}/fixtures/${fixtureId}`);

    await expect(admin.getByText(/Victoria por incomparecencia/)).toBeVisible();
    // Walkover: fixture scores render (2 – 0 here) with zero summary sections.
    await expect(admin.getByText(/2 – 0/)).toBeVisible();
    await expect(admin.getByText(/Afición/)).toBeHidden();
    await expect(admin.getByText(/Clima/)).toBeHidden();
  } finally {
    await league.admin.context().close();
    await league.rival.context().close();
  }
});
