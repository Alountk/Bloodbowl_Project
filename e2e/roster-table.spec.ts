import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
test.use({ locale: "es-ES" });

/**
 * Real-DB E2E for the RAU-46 TourPlay-style roster table and its PE-spending
 * improve modal (run via `pnpm run test:e2e:auth` with AUTH_MODE=auth and a
 * running Postgres). Protects the behaviors that replaced the old
 * ProgressionPanel:
 *
 *  1. the owner's team detail renders the TourPlay column set
 *     (Nº/Jugador/Características/Habilidades y rasgos/NI/SPP/CAS/MVP/Valor)
 *     with a clickable row per roster player;
 *  2. a player with no PE opens a modal with only the "Sin PE suficientes..."
 *     note and an editable name — no upgrade select;
 *  3. a rename (with the 🎲 random re-roll) persists through ACEPTAR and
 *     survives a reload in the roster row;
 *  4. the upgrade select is filtered by PE affordability: no Característica
 *     option below the attribute cost, present at/above it;
 *  5. a rival (league member) views the same roster read-only — clicking a row
 *     opens no modal.
 *
 * Every test builds its own fresh 2-member league (unique emails/names so the
 * persisted Postgres never collides) and loads a result through the real
 * ResultModal; PE amounts are asserted by range/option presence, never by
 * brittle absolute values (the server's 1D6 MJP grant may add +4 PE). NOTE
 * (auth cold-start race): the first auth-suite run after a fresh boot can time
 * out on /signup; a re-run is green.
 */
test.setTimeout(240_000);

const PASSWORD = "password-123";
const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

/** Signs up and lands on the home page with an active session. */
async function signup(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Registrarse" }).last().click();
  await expect(page).toHaveURL("/");
}

/** Creates a human team of `playerCount` (default 11, the BB2025 minimum). */
async function createTeam(page: Page, name: string, playerCount = 11) {
  await page.goto("/teams/create");
  await page.getByLabel("Nombre del equipo").fill(name);
  await page.getByLabel("Raza").selectOption("human");
  await page.getByRole("button", { name: "Siguiente →" }).click();
  const add = page.getByRole("button", { name: "Añadir Lineman" }).first();
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

/** Resolves an owned team's id by name via GET /api/teams. */
async function ownedTeamId(page: Page, name: string): Promise<string> {
  const res = await page.request.get("/api/teams");
  expect(res.status()).toBe(200);
  const teams = (await res.json()) as { id: string; name: string }[];
  const team = teams.find((t) => t.name === name);
  expect(team, `owned team "${name}"`).toBeDefined();
  return team!.id;
}

async function createLeague(page: Page, name: string) {
  await page.goto("/leagues");
  await expect(page.getByRole("heading", { level: 1, name: "Mis Ligas" })).toBeVisible();
  await page.getByRole("button", { name: "+ Nueva liga" }).first().click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Descripción").fill("Liga roster-table e2e");
  await page.getByRole("button", { name: "Crear liga" }).click();
  await expect(page.getByText(name)).toBeVisible();
}

/** Opens the league detail card and returns its URL (contains the league id). */
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
  close: () => Promise<void>;
}

/** Builds a started 2-member league (admin A owns the league AND a team; rival
 * B joins). The round-robin yields exactly one 1-jornada, 1-fixture match A×B. */
async function buildTwoMemberStartedLeague(
  browser: Browser,
  tag: string,
): Promise<TwoMemberLeague> {
  const contextA = await browser.newContext({ locale: "es-ES" });
  const contextB = await browser.newContext({ locale: "es-ES" });
  const admin = await contextA.newPage();
  const rival = await contextB.newPage();
  const close = async () => {
    await contextA.close();
    await contextB.close();
  };

  try {
    await signup(admin, uniqueEmail(`rt-admin-${tag}`));
    const teamAName = `RTA-${tag} ${Date.now()}`;
    await createTeam(admin, teamAName);
    const leagueName = `RT Liga ${tag} ${Date.now()}`;
    await createLeague(admin, leagueName);
    const leagueUrl = await openLeagueCard(admin, leagueName);
    const leagueId = /\/leagues\/(.+)$/.exec(leagueUrl)?.[1];
    expect(leagueId).toBeDefined();
    await admin.getByLabel("Tu equipo").selectOption({ label: teamAName });
    await admin.getByRole("button", { name: "Apuntarse" }).click();
    await expect(admin.getByText(teamAName)).toBeVisible();

    await signup(rival, uniqueEmail(`rt-rival-${tag}`));
    const teamBName = `RTB-${tag} ${Date.now()}`;
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

    return { admin, rival, leagueId: leagueId as string, teamAName, teamBName, close };
  } catch (error) {
    await close();
    throw error;
  }
}

/** Schedules the single fixture via API: rival B proposes a date, admin A (a
 * fixture participant) accepts. Avoids the negotiation-modal flake already
 * covered by league-matchday; the RESULT is loaded through the real modal. */
async function scheduleFixture(league: TwoMemberLeague) {
  const { admin, rival, leagueId } = league;
  const detail = await admin.request.get(`/api/leagues/${leagueId}`);
  expect(detail.status()).toBe(200);
  const body = (await detail.json()) as { fixtures: { id: string }[] };
  const fixtureId = body.fixtures[0].id;
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

/** Polls the league detail until the given fixture reaches a status. */
async function waitForFixtureStatus(
  page: Page,
  leagueId: string,
  fixtureId: string,
  status: string,
) {
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

interface PlayerAction {
  name: string;
  tds?: number;
  completions?: number;
  interceptions?: number;
}

/** Fills one team section of the open ResultModal (labels are scoped by team
 * name) with the given score and per-player actions, then the 6 MJP picks. */
async function fillResultSection(
  section: Locator,
  teamName: string,
  score: number,
  actions: PlayerAction[],
) {
  await section.getByLabel(`Goles ${teamName}`).fill(String(score));
  for (const action of actions) {
    if (action.tds) {
      await section.getByLabel(`Anotaciones ${action.name}`, { exact: true }).fill(String(action.tds));
    }
    if (action.completions) {
      await section.getByLabel(`Pases completos ${action.name}`, { exact: true }).fill(String(action.completions));
    }
    if (action.interceptions) {
      await section.getByLabel(`Intercepciones ${action.name}`, { exact: true }).fill(String(action.interceptions));
    }
  }
  for (let i = 1; i <= 6; i++) {
    await section.getByLabel(`MVP ${i} ${teamName}`).selectOption({ index: i });
  }
}

/** Loads a `score`–0 win for the admin's team through the real ResultModal,
 * crediting the given per-player actions (the ΣTD must equal `score`). */
async function loadResult(
  page: Page,
  teamAName: string,
  teamBName: string,
  score: number,
  actions: PlayerAction[],
) {
  await page.getByRole("button", { name: "Cargar resultado" }).first().click();
  const dialog = page.getByRole("dialog", { name: /Cargar resultado/ });
  await expect(dialog).toBeVisible();
  await fillResultSection(dialog.getByLabel(`Resultado ${teamAName}`), teamAName, score, actions);
  await fillResultSection(dialog.getByLabel(`Resultado ${teamBName}`), teamBName, 0, []);
  await dialog.getByRole("button", { name: "Guardar resultado" }).click();
  await expect(dialog).not.toBeVisible();
}

/** Resolves the admin's team id + roster (roster order = Player 1..11) from the
 * league detail via the admin's session. */
async function adminTeamRoster(league: TwoMemberLeague): Promise<{
  teamId: string;
  roster: { id: string; name: string }[];
}> {
  const detail = await league.admin.request.get(`/api/leagues/${league.leagueId}`);
  expect(detail.status()).toBe(200);
  const body = (await detail.json()) as {
    teams: { id: string; name: string; roster: { id: string; name: string }[] }[];
  };
  const team = body.teams.find((t) => t.name === league.teamAName);
  expect(team).toBeDefined();
  return { teamId: team!.id, roster: team!.roster };
}

// --- Journey 1: the owner sees the TourPlay column set -------------------------
test("roster table renders the TourPlay column set for the owner", async ({ browser }) => {
  const context = await browser.newContext({ locale: "es-ES" });
  try {
    const page = await context.newPage();
    await signup(page, uniqueEmail("rt-render"));
    const teamName = `RT Render ${Date.now()}`;
    await createTeam(page, teamName);
    const teamId = await ownedTeamId(page, teamName);
    await page.goto(`/teams/${teamId}`);

    const table = page.getByTestId("team-roster-table");
    await expect(table).toBeVisible();
    for (const header of [
      "Nº",
      "Jugador",
      "Características",
      "Habilidades y rasgos",
      "NI",
      "SPP",
      "CAS",
      "MVP",
      "Valor",
    ]) {
      await expect(table.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    }
    // A roster row per player, identified by the normalized name.
    const firstRow = table.locator("tbody tr").first();
    await expect(firstRow).toContainText("Player 1");
    await expect(firstRow).toContainText("Lineman");
  } finally {
    await context.close();
  }
});

// --- Journey 2: no-PE player → note + editable name, no upgrade select ---------
test("a player with no PE opens only the rename note — no upgrade select", async ({
  browser,
}) => {
  const league = await buildTwoMemberStartedLeague(browser, "nope");
  try {
    const fixtureId = await scheduleFixture(league);
    await league.admin.reload();
    await loadResult(league.admin, league.teamAName, league.teamBName, 2, [
      { name: "Player 1", tds: 2 },
    ]);
    await waitForFixtureStatus(league.admin, league.leagueId, fixtureId, "played");

    const { teamId, roster } = await adminTeamRoster(league);
    // Player 7 (roster index 6) is outside the six MJP nominations and scored
    // nothing → its PE is deterministically 0. Wait for the progression row to
    // load (the SPP cell only renders once it has) before clicking.
    const p7Id = roster[6].id;
    await league.admin.goto(`/teams/${teamId}`);
    await expect(league.admin.getByTestId(`spp-pe-${p7Id}`)).toBeVisible();
    await league.admin.getByTestId(`roster-row-${p7Id}`).click();
    const modal = league.admin.getByTestId("improve-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId("modal-no-pe")).toHaveText(/Sin PE suficientes para mejorar/);
    await expect(modal.getByTestId("upgrade-select")).toHaveCount(0);
    await expect(modal.getByTestId("modal-pe-badge")).toHaveCount(0);
    // Nº and Nombre stay editable (rename allowed) with the 🎲 re-roll.
    await expect(modal.getByTestId("modal-number")).toHaveText("7");
    await expect(modal.getByLabel("Nombre", { exact: true })).toBeEnabled();
    await expect(modal.getByRole("button", { name: "Tirar nombre al azar" })).toBeVisible();
  } finally {
    await league.close();
  }
});

// --- Journey 3: a rename (with 🎲 re-roll) persists through ACEPTAR ------------
test("a rename (with 🎲 re-roll) persists through ACEPTAR and a reload", async ({
  browser,
}) => {
  const league = await buildTwoMemberStartedLeague(browser, "rename");
  try {
    const fixtureId = await scheduleFixture(league);
    await league.admin.reload();
    await loadResult(league.admin, league.teamAName, league.teamBName, 2, [
      { name: "Player 1", tds: 2 },
    ]);
    await waitForFixtureStatus(league.admin, league.leagueId, fixtureId, "played");

    const { teamId, roster } = await adminTeamRoster(league);
    const p7Id = roster[6].id;
    await league.admin.goto(`/teams/${teamId}`);
    // Wait for the progression row to load before the row click can open the modal.
    await expect(league.admin.getByTestId(`spp-pe-${p7Id}`)).toBeVisible();
    await league.admin.getByTestId(`roster-row-${p7Id}`).click();
    const modal = league.admin.getByTestId("improve-modal");
    await expect(modal).toBeVisible();

    const nameInput = modal.getByLabel("Nombre", { exact: true });
    // Type a fixed name, then let the 🎲 re-roll replace it — ACEPTAR must
    // persist whatever name is in the field.
    await nameInput.fill("Renombrado P7");
    await modal.getByRole("button", { name: "Tirar nombre al azar" }).click();
    const rolledName = await nameInput.inputValue();
    expect(rolledName.length).toBeGreaterThan(0);
    await modal.getByTestId("modal-accept").click();
    await expect(modal).not.toBeVisible();

    await league.admin.reload();
    const row = league.admin.getByTestId(`roster-row-${p7Id}`);
    await expect(row.getByText(rolledName)).toBeVisible();
    await expect(row.getByText("Player 7")).toHaveCount(0);
  } finally {
    await league.close();
  }
});

// --- Journey 4: the upgrade select is filtered by PE affordability -------------
test("the upgrade select filters options by PE affordability (Característica)", async ({
  browser,
}) => {
  const league = await buildTwoMemberStartedLeague(browser, "afford");
  try {
    const fixtureId = await scheduleFixture(league);
    await league.admin.reload();
    // Player 1: 2 TDs (6) + 4 completions (4) + 2 interceptions (4) = 14 PE —
    // exactly the first attribute cost, so Característica must be offered.
    // Player 2: 1 TD = 3 PE — above the 3-PE random cost but below the 14-PE
    // attribute cost, so Característica must NOT be offered.
    await loadResult(league.admin, league.teamAName, league.teamBName, 3, [
      { name: "Player 1", tds: 2, completions: 4, interceptions: 2 },
      { name: "Player 2", tds: 1 },
    ]);
    await waitForFixtureStatus(league.admin, league.leagueId, fixtureId, "played");

    const { teamId, roster } = await adminTeamRoster(league);
    const p1Id = roster[0].id;
    const p2Id = roster[1].id;
    await league.admin.goto(`/teams/${teamId}`);
    // Wait for the progression rows to load before clicking them.
    await expect(league.admin.getByTestId(`spp-pe-${p1Id}`)).toBeVisible();
    await expect(league.admin.getByTestId(`spp-pe-${p2Id}`)).toBeVisible();

    // Player 1 (14+ PE): the Característica option and the attribute +1 picks
    // are present alongside Aleatorio.
    await league.admin.getByTestId(`roster-row-${p1Id}`).click();
    let modal = league.admin.getByTestId("improve-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId("upgrade-select").locator('option[value="attribute"]')).toHaveCount(1);
    await expect(modal.getByTestId("upgrade-select").locator('option[value="random"]')).toHaveCount(1);
    await expect(modal.getByTestId("attr-select-ma").locator('option[value="plus"]')).toHaveCount(1);
    await modal.getByRole("button", { name: "Cerrar" }).click();
    await expect(modal).not.toBeVisible();

    // Player 2 (3–7 PE): no Característica option, no attribute +1, but the
    // Aleatorio option is offered.
    await league.admin.getByTestId(`roster-row-${p2Id}`).click();
    modal = league.admin.getByTestId("improve-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId("upgrade-select").locator('option[value="attribute"]')).toHaveCount(0);
    await expect(modal.getByTestId("upgrade-select").locator('option[value="random"]')).toHaveCount(1);
    await expect(modal.getByTestId("attr-select-ma").locator('option[value="plus"]')).toHaveCount(0);
  } finally {
    await league.close();
  }
});

// --- Journey 5: rival scouting is read-only (no modal on row click) ------------
test("a rival member views the roster read-only: no modal on row click", async ({
  browser,
}) => {
  const league = await buildTwoMemberStartedLeague(browser, "scout");
  try {
    const fixtureId = await scheduleFixture(league);
    await league.admin.reload();
    await loadResult(league.admin, league.teamAName, league.teamBName, 2, [
      { name: "Player 1", tds: 2 },
    ]);
    await waitForFixtureStatus(league.admin, league.leagueId, fixtureId, "played");

    const { teamId } = await adminTeamRoster(league);
    await league.rival.goto(`/teams/${teamId}`);
    const table = league.rival.getByTestId("team-roster-table");
    await expect(table).toBeVisible();
    // Read-only rows have no click handler: clicking opens no improve modal.
    await table.locator("tbody tr").first().click();
    await expect(league.rival.getByTestId("improve-modal")).toHaveCount(0);
  } finally {
    await league.close();
  }
});
