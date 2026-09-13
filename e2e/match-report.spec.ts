import { test, expect, type Page, type Browser } from "@playwright/test";
test.use({ locale: "es-ES" });

/**
 * Real-DB match-report E2E journeys (run via `pnpm run test:e2e:auth` with
 * AUTH_MODE=auth and a running Postgres). This is PR6 (the final match-report
 * slice) and closes the loop on the post-match resolution flows that the
 * route/component layers prove in isolation:
 *
 *  1. result + progression (match-result, player-progression): a started
 *     2-member league's single fixture is scheduled, the league OWNER (a
 *     fixture participant) loads a 2–0 win through the "Acta del partido"
 *     wizard (the single entry point that replaced the legacy ResultModal), the
 *     MatchCard shows the score and the round becomes "Jornada completa"; the
 *     same owner then visits their own team detail and spends the scorer's PE on
 *     an élite skill (Block) through the rulebook roster's improve modal (row
 *     click), seeing the élite ◆ diamond and the recalculated value.
 *  2. correction (match-result R5): a 3-member, 2-jornada league's round-1
 *     fixture is played, and the league owner (admin) corrects that result
 *     through the wizard (opened from the `···` overflow) while the season is
 *     STILL started (round 2 unplayed) → the MatchCard score updates. Since
 *     RAU-40, loading the LAST fixture of a season closes the league, so a
 *     correction must be exercised before the season finishes.
 *  3. finished season (RAU-40): loading the single result of a 2-member league
 *     closes it — the participant captain sees the champion panel, the whole
 *     `···` overflow (which now hosts the correction) disappears, and a
 *     correction PUT is rejected (409).
 *
 * The 2-member league yields exactly one fixture (no round-robin byes), so the
 * pairing and the "Jornada completa" assertion are deterministic. The fixture's
 * home/away sides are shuffled at start, so every wizard interaction is scoped by
 * the TEAM NAME (the wizard labels each section and its inputs with the
 * team name, not "home"/"away").
 *
 * NOTE (auth cold-start race): the FIRST auth-suite run after a fresh boot can
 * time out on /signup while the dev server + Postgres cold-start; a re-run is
 * green. Each test uses unique emails/names so the persisted Postgres never
 * collides and the suite is idempotent.
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
  await page.getByLabel("Nombre").fill("Entrenador E2E");
  await page.getByRole("button", { name: "Registrarse" }).last().click();
  await expect(page).toHaveURL("/");
}

/** Creates a human team of `playerCount` (default 11, the BB2025 minimum). */
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

async function createLeague(page: Page, name: string) {
  await page.goto("/leagues");
  await expect(page.getByRole("heading", { level: 1, name: "Mis Ligas" })).toBeVisible();
  await page.getByRole("button", { name: "+ Nueva liga" }).first().click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Descripción").fill("Liga match-report e2e");
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

/** Builds a started 2-member league (admin A owns the league AND a team; rival
 * B joins). The round-robin yields exactly one 1-jornada, 1-fixture match A×B. */
interface TwoMemberLeague {
  admin: Page;
  rival: Page;
  leagueId: string;
  teamAName: string;
  teamBName: string;
}

async function buildTwoMemberStartedLeague(
  browser: Browser,
  tag: string,
): Promise<TwoMemberLeague> {
  const contextA = await browser.newContext({ locale: "es-ES" });
  const contextB = await browser.newContext({ locale: "es-ES" });
  const admin = await contextA.newPage();
  const rival = await contextB.newPage();

  try {
    await signup(admin, uniqueEmail(`mr-admin-${tag}`));
    const teamAName = `MA-${tag} ${Date.now()}`;
    await createTeam(admin, teamAName);
    const leagueName = `MR Liga ${tag} ${Date.now()}`;
    await createLeague(admin, leagueName);
    const leagueUrl = await openLeagueCard(admin, leagueName);
    const leagueId = /\/leagues\/(.+)$/.exec(leagueUrl)?.[1];
    expect(leagueId).toBeDefined();
    await admin.getByLabel("Tu equipo").selectOption({ label: teamAName });
    await admin.getByRole("button", { name: "Apuntarse" }).click();
    await expect(admin.getByText(teamAName)).toBeVisible();

    await signup(rival, uniqueEmail(`mr-rival-${tag}`));
    const teamBName = `MB-${tag} ${Date.now()}`;
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

/** Schedules the single fixture via API: rival B proposes a date, admin A (a
 * fixture participant) accepts. Avoids the negotiation-modal flake already
 * covered by league-matchday; the RESULT is loaded through the real wizard. */
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

/** A 3-member league (A admin+team, B rival, C third) started with 2 jornadas.
 * A round-robin of 3 teams yields two rounds of one pairing each, so playing a
 * single fixture leaves the league STARTED — the window where a result
 * correction is still legal (RAU-40 closes a season only on its LAST fixture). */
interface ThreeMemberLeague {
  admin: Page;
  rival: Page;
  third: Page;
  leagueId: string;
  teamAName: string;
  teamBName: string;
  teamCName: string;
}

async function buildThreeMemberStartedLeague(
  browser: Browser,
  tag: string,
): Promise<ThreeMemberLeague> {
  const contextA = await browser.newContext({ locale: "es-ES" });
  const contextB = await browser.newContext({ locale: "es-ES" });
  const contextC = await browser.newContext({ locale: "es-ES" });
  const admin = await contextA.newPage();
  const rival = await contextB.newPage();
  const third = await contextC.newPage();

  try {
    await signup(admin, uniqueEmail(`mr3-admin-${tag}`));
    const teamAName = `M3A-${tag} ${Date.now()}`;
    await createTeam(admin, teamAName);
    const leagueName = `MR3 Liga ${tag} ${Date.now()}`;
    await createLeague(admin, leagueName);
    const leagueUrl = await openLeagueCard(admin, leagueName);
    const leagueId = /\/leagues\/(.+)$/.exec(leagueUrl)?.[1];
    expect(leagueId).toBeDefined();
    await admin.getByLabel("Tu equipo").selectOption({ label: teamAName });
    await admin.getByRole("button", { name: "Apuntarse" }).click();
    await expect(admin.getByText(teamAName)).toBeVisible();

    const teamBName = `M3B-${tag} ${Date.now()}`;
    await signup(rival, uniqueEmail(`mr3-rival-${tag}`));
    await createTeam(rival, teamBName);
    await rival.goto("/leagues");
    await openLeagueCard(rival, leagueName);
    await rival.getByLabel("Tu equipo").selectOption({ label: teamBName });
    await rival.getByRole("button", { name: "Apuntarse" }).click();
    await expect(rival.getByText(teamBName)).toBeVisible();

    const teamCName = `M3C-${tag} ${Date.now()}`;
    await signup(third, uniqueEmail(`mr3-third-${tag}`));
    await createTeam(third, teamCName);
    await third.goto("/leagues");
    await openLeagueCard(third, leagueName);
    await third.getByLabel("Tu equipo").selectOption({ label: teamCName });
    await third.getByRole("button", { name: "Apuntarse" }).click();
    await expect(third.getByText(teamCName)).toBeVisible();

    await admin.reload();
    await expect(admin.getByRole("heading", { name: leagueName })).toBeVisible();
    const startButton = admin.getByRole("button", { name: "Iniciar liga" });
    await expect(startButton).toBeEnabled();
    await startButton.click();
    await expect(admin.getByRole("dialog", { name: "Iniciar liga" })).toBeVisible();
    // 3 teams → up to 2 jornadas. Two rounds leave a fixture unplayed after the
    // first result, so the correction journey stays inside a started league.
    await admin.getByLabel("¿Cuántas jornadas?").fill("2");
    await admin
      .getByRole("dialog", { name: "Iniciar liga" })
      .getByRole("button", { name: "Iniciar liga" })
      .click();
    await expect(admin.getByText("Iniciada")).toBeVisible();

    return { admin, rival, third, leagueId: leagueId as string, teamAName, teamBName, teamCName };
  } catch (error) {
    await contextA.close();
    await contextB.close();
    await contextC.close();
    throw error;
  }
}

/** Resolves the round-1 pairing of a 3-member league (shuffled at start) into
 * the fixture id and the two TEAM NAMES — the wizard labels are name-based. */
async function roundOnePairing(league: ThreeMemberLeague) {
  const detail = await league.admin.request.get(`/api/leagues/${league.leagueId}`);
  expect(detail.status()).toBe(200);
  const body = (await detail.json()) as {
    fixtures: { id: string; round: number; homeTeamId: string; awayTeamId: string }[];
    teams: { id: string; name: string }[];
  };
  const fixture = body.fixtures.find((f) => f.round === 1);
  expect(fixture).toBeDefined();
  const nameOf = (teamId: string) => body.teams.find((t) => t.id === teamId)?.name ?? teamId;
  return {
    fixtureId: fixture!.id,
    homeName: nameOf(fixture!.homeTeamId),
    awayName: nameOf(fixture!.awayTeamId),
  };
}

/** Schedules a given fixture via API: one participant proposes, the OTHER
 * participant accepts. The 3-member pairing is shuffled, so the proposer/
 * acceptor are resolved from the fixture's actual home/away team owners. */
async function scheduleFixtureById(league: ThreeMemberLeague, fixtureId: string) {
  const { admin, rival, third, leagueId } = league;
  const detail = await admin.request.get(`/api/leagues/${leagueId}`);
  expect(detail.status()).toBe(200);
  const body = (await detail.json()) as {
    fixtures: { id: string; homeTeamId: string; awayTeamId: string }[];
    teams: { id: string; name: string }[];
  };
  const fixture = body.fixtures.find((f) => f.id === fixtureId);
  expect(fixture).toBeDefined();
  const pageOf = (teamId: string) => {
    const name = body.teams.find((t) => t.id === teamId)?.name;
    if (name === league.teamAName) return admin;
    if (name === league.teamBName) return rival;
    return third;
  };
  const homePage = pageOf(fixture!.homeTeamId);
  const awayPage = pageOf(fixture!.awayTeamId);
  const proposer = homePage === admin ? awayPage : homePage;
  const acceptor = proposer === awayPage ? homePage : awayPage;

  const proposal = await proposer.request.post(
    `/api/leagues/${leagueId}/fixtures/${fixtureId}/propose`,
    { data: { date: new Date(Date.now() + 10 * 86400_000).toISOString() } },
  );
  expect(proposal.status()).toBe(200);
  const prop = (await proposal.json()) as { id: string };
  const accepted = await acceptor.request.post(
    `/api/leagues/${leagueId}/fixtures/${fixtureId}/accept`,
    { data: { proposalId: prop.id } },
  );
  expect(accepted.status()).toBe(200);
  return fixtureId;
}

/** Polls the league detail until the given fixture reaches a status. The wizard's
 * async POST resolves in the background after the dialog closes; this emulates
 * the UI refresh without racing the commit. */
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

/** Loads a result through the "Acta del partido" wizard (the single entry point
 * that replaced the legacy ResultModal in s4b/s6c): the ADMIN team
 * (`winnerTeamName`) wins `score`–0, with its first roster player ("Player 1")
 * credited every TD → the PE the élite purchase later spends. The wizard is
 * driven step by step — Contexto → Marcador → Acciones → MVP → Bajas → Final →
 * Revisar — and BOTH teams get an MVP, because the MAW-8 save-block refuses to
 * save unless Σ anotaciones == marcador AND both MVPs are selected. Every label
 * is scoped by team NAME (the wizard labels each section and its inputs with the
 * team name, never "home"/"away"), so the shuffled fixture side does not matter. */
async function loadResultViaModal(
  page: Page,
  winnerTeamName: string,
  loserTeamName: string,
  score: number,
) {
  await page.getByRole("button", { name: "Acta del partido" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Acta del partido" });
  await expect(dialog).toBeVisible();

  // Step 0 · Contexto — the defaults are valid (Perfecto weather, no FF).
  await dialog.getByRole("button", { name: "Siguiente" }).click();

  // Step 1 · Marcador — winner scores `score`, loser 0.
  await dialog.getByLabel(winnerTeamName, { exact: true }).fill(String(score));
  await dialog.getByLabel(loserTeamName, { exact: true }).fill("0");
  await dialog.getByRole("button", { name: "Siguiente" }).click();

  // Step 2 · Acciones — the winner's Player 1 takes every TD in one line; the
  // loser records nothing (its marcador is 0, so Σ anotaciones must be 0).
  const winner = dialog.getByRole("region", { name: winnerTeamName, exact: true });
  await winner
    .getByRole("button", { name: `Añadir acción · ${winnerTeamName}`, exact: true })
    .click();
  await winner
    .getByLabel(`Jugador 1 · ${winnerTeamName}`)
    .selectOption({ label: "Player 1" });
  await winner.getByLabel(`Cantidad 1 · ${winnerTeamName}`).fill(String(score));
  await dialog.getByRole("button", { name: "Siguiente" }).click();

  // Step 3 · MVP — exactly one per team (the MAW-8 save-block requires both).
  await dialog
    .getByRole("radio", { name: `MVP · ${winnerTeamName} · Player 1`, exact: true })
    .check();
  await dialog
    .getByRole("radio", { name: `MVP · ${loserTeamName} · Player 1`, exact: true })
    .check();
  await dialog.getByRole("button", { name: "Siguiente" }).click();

  // Step 4 · Bajas — no casualties recorded, advance.
  await dialog.getByRole("button", { name: "Siguiente" }).click();
  // Step 5 · Final — the fan 1D6 is optional, advance.
  await dialog.getByRole("button", { name: "Siguiente" }).click();

  // Step 6 · Revisar — the acta validates, save.
  await dialog.getByRole("button", { name: "Guardar acta" }).click();
  await expect(dialog).not.toBeVisible();
}

test("result + progression: load a win through the modal → score + jornada completa, then spend PE on an élite skill", async ({
  browser,
}) => {
  const league = await buildTwoMemberStartedLeague(browser, "prog");
  try {
    const fixtureId = await scheduleFixture(league);
    await league.admin.reload();

    // Load the 2–0 win for the admin's team through the real modal.
    await loadResultViaModal(league.admin, league.teamAName, league.teamBName, 2);

    // The async POST commits in the background; poll until the fixture is played.
    await waitForFixtureStatus(league.admin, league.leagueId, fixtureId, "played");

    // The MatchCard shows the score in the CENTER (either side) and the single
    // round completes.
    await league.admin.reload();
    const region = league.admin.getByRole("region", { name: "Jornada 1" });
    await expect(region.getByText(/Partido 1 · Jugado/)).toBeVisible();
    await expect(region.getByText(/(2 : 0|0 : 2)/)).toBeVisible();
    await expect(league.admin.getByText("Jornada completa")).toBeVisible();

    // Same owner spends the scorer's PE (2 TDs → 6 PE) on Block (élite primary)
    // through the rulebook roster: a row click opens the PE-spending modal.
    const detail = await league.admin.request.get(`/api/leagues/${league.leagueId}`);
    const teams = ((await detail.json()) as {
      teams: { id: string; name: string; roster: { id: string; name: string }[] }[];
    }).teams;
    const adminTeam = teams.find((t) => t.name === league.teamAName);
    expect(adminTeam).toBeDefined();
    const p1Id = adminTeam!.roster[0].id;
    await league.admin.goto(`/teams/${adminTeam!.id}`);
    await expect(league.admin.getByTestId("team-roster-table")).toBeVisible();

    // Player 1 (roster order) earned ≥6 PE (2 TDs, plus the server's 1D6 MJP
    // grant when it lands on them). The modal shows the balance and the
    // affordable upgrade select.
    const row = league.admin.getByTestId(`roster-row-${p1Id}`);
    await expect(row.getByTestId(`spp-pe-${p1Id}`)).toHaveText(/★\d+/);
    await row.click();
    const modal = league.admin.getByTestId("improve-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Player 1")).toBeVisible();
    await expect(modal.getByTestId("modal-pe-label")).toHaveText(/★\d+ disponibles/);
    const upgradeSelect = modal.getByTestId("upgrade-select");
    await expect(upgradeSelect).toBeVisible();
    // Block is élite with G access on a human lineman: buyable as a primary.
    await upgradeSelect.selectOption("primary:block");
    await modal.getByTestId("modal-accept").click();
    await expect(modal).not.toBeVisible();

    // The improvement persists: after a reload the row shows Block with the ◆
    // élite diamond and the value recap includes the +20.000 bonus.
    await league.admin.reload();
    const afterRow = league.admin.getByTestId(`roster-row-${p1Id}`);
    // The es display name is "Placar" (slice-2 OCR correction); Block = the élite skill id.
    await expect(afterRow.getByText("Placar")).toBeVisible();
    await expect(afterRow.getByTestId("elite-diamond")).toBeVisible();
    await expect(afterRow.getByTestId(`player-value-${p1Id}`)).toHaveText("70 000");
  } finally {
    await league.admin.context()?.close().catch(() => undefined);
    await league.rival.context()?.close().catch(() => undefined);
  }
});

test("correction: admin corrects a played result → the MatchCard score updates", async ({
  browser,
}) => {
  // A 3-member, 2-jornada league: playing round 1 leaves the season STARTED
  // (round 2 unplayed), the window where a correction is still allowed (RAU-40).
  const league = await buildThreeMemberStartedLeague(browser, "corr");
  try {
    const { fixtureId, homeName, awayName } = await roundOnePairing(league);
    await scheduleFixtureById(league, fixtureId);
    await league.admin.reload();
    await loadResultViaModal(league.admin, homeName, awayName, 2);
    await waitForFixtureStatus(league.admin, league.leagueId, fixtureId, "played");

    // The league is NOT finished (a second-round fixture remains unplayed), so
    // the admin can still correct the played result through the wizard. The
    // correction now lives in the `···` overflow (MAW-1). The jornadas default
    // to the first INCOMPLETE round (round 2), so switch to Jornada 1 where the
    // played fixture lives.
    await league.admin.reload();
    await league.admin.getByRole("tab", { name: "Jornada 1" }).click();
    await league.admin.getByRole("button", { name: "Más acciones" }).first().click();
    await league.admin.getByRole("menuitem", { name: "Corregir resultado" }).click();
    const dialog = league.admin.getByRole("dialog", { name: "Corregir acta del partido" });
    await expect(dialog).toBeVisible();

    // Step 0 · Contexto — the prefill (MAW-9) carries the loaded result, advance.
    await dialog.getByRole("button", { name: "Siguiente" }).click();

    // Step 1 · Marcador — correct the 2–0 load to a 1–1 draw.
    await dialog.getByLabel(homeName, { exact: true }).fill("1");
    await dialog.getByLabel(awayName, { exact: true }).fill("1");
    await dialog.getByRole("button", { name: "Siguiente" }).click();

    // Step 2 · Acciones — the prefill credits home Player 1 with the two loaded
    // TDs; drop it to one and add the away TD so Σ anotaciones == 1 per side.
    const homeRegion = dialog.getByRole("region", { name: homeName, exact: true });
    const awayRegion = dialog.getByRole("region", { name: awayName, exact: true });
    await homeRegion.getByLabel(`Cantidad 1 · ${homeName}`).fill("1");
    await awayRegion
      .getByRole("button", { name: `Añadir acción · ${awayName}`, exact: true })
      .click();
    await awayRegion.getByLabel(`Jugador 1 · ${awayName}`).selectOption({ label: "Player 1" });
    await awayRegion.getByLabel(`Cantidad 1 · ${awayName}`).fill("1");
    await dialog.getByRole("button", { name: "Siguiente" }).click();

    // Step 3 · MVP — the prefill already carries both grantees; confirm them.
    await dialog
      .getByRole("radio", { name: `MVP · ${homeName} · Player 1`, exact: true })
      .check();
    await dialog
      .getByRole("radio", { name: `MVP · ${awayName} · Player 1`, exact: true })
      .check();
    await dialog.getByRole("button", { name: "Siguiente" }).click();

    // Step 4 · Bajas — none; advance. Step 5 · Final — advance.
    await dialog.getByRole("button", { name: "Siguiente" }).click();
    await dialog.getByRole("button", { name: "Siguiente" }).click();

    // Step 6 · Revisar — save the corrected acta.
    await dialog.getByRole("button", { name: "Guardar acta" }).click();
    await expect(dialog).not.toBeVisible();

    // Poll until the corrected score commits, then verify the card shows it.
    await expect
      .poll(
        async () => {
          const res = await league.admin.request.get(`/api/leagues/${league.leagueId}`);
          if (res.status() !== 200) return null;
          const body = (await res.json()) as {
            fixtures: { id: string; homeScore: number | null; awayScore: number | null }[];
          };
          const f = body.fixtures.find((x) => x.id === fixtureId);
          return f ? `${f.homeScore}-${f.awayScore}` : null;
        },
        { timeout: 20_000 },
      )
      .not.toBe(null);
    await league.admin.reload();
    // Round 2 is the first incomplete round (default tab); the corrected fixture
    // lives on Jornada 1.
    await league.admin.getByRole("tab", { name: "Jornada 1" }).click();
    const after = league.admin.getByRole("region", { name: "Jornada 1" });
    // The corrected draw renders in the CENTER (Design B scorebox).
    await expect(after.getByText(/1 : 1/)).toBeVisible();
  } finally {
    await league.admin.context()?.close().catch(() => undefined);
    await league.rival.context()?.close().catch(() => undefined);
    await league.third.context()?.close().catch(() => undefined);
  }
});

test("correction: a finished league rejects a captain's correction and shows the champion (RAU-40)", async ({
  browser,
}) => {
  const league = await buildTwoMemberStartedLeague(browser, "captcorr");
  try {
    const fixtureId = await scheduleFixture(league);
    // The admin loads the result first (2–0 for team A) so the fixture is played.
    await league.admin.reload();
    await loadResultViaModal(league.admin, league.teamAName, league.teamBName, 2);
    await waitForFixtureStatus(league.admin, league.leagueId, fixtureId, "played");

    // The result was the season's LAST fixture → the league finished. The rival
    // (a participant captain) sees the champion panel and the Finalizada badge,
    // and the correction affordance is gone: it now lives in the `···` overflow
    // (MAW-1), and a finished league hides the whole overflow.
    await league.rival.reload();
    await expect(league.rival.getByText("Finalizada", { exact: true })).toBeVisible();
    await expect(league.rival.getByTestId("champion-panel")).toBeVisible();
    await expect(
      league.rival.getByRole("button", { name: "Más acciones" }),
    ).toHaveCount(0);
    await expect(
      league.rival.getByRole("menuitem", { name: "Corregir resultado" }),
    ).toHaveCount(0);

    // A captain's correction PUT is rejected (409) before any body validation.
    const rejected = await league.rival.request.put(
      `/api/leagues/${league.leagueId}/fixtures/${fixtureId}/result`,
      { data: { home: {}, away: {} } },
    );
    expect(rejected.status()).toBe(409);
  } finally {
    await league.admin.context()?.close().catch(() => undefined);
    await league.rival.context()?.close().catch(() => undefined);
  }
});
