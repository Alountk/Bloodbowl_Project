import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
test.use({ locale: "es-ES" });

/**
 * RAU-49 end-of-match RESOLUTION E2E (auth suite — `pnpm run test:e2e:auth`
 * with AUTH_MODE=auth + Postgres; ignored in the local `AUTH_MODE=local` suite).
 *
 * The resolve command IS the closure of a finished live match: three journeys:
 *   1. endMatch → resolve → the fixture is PLAYED with scores + "Jornada
 *      completa" (the previously-never-closed normally-finished live match).
 *   2. auto-finish (a TD in half-2 turn 8 finishes the match) → resolve → the
 *      same closure + the MVP rows (★4) in the feed.
 *   3. concede → the fixture was ALREADY closed by the walkover, but the
 *      resolution still runs: awards + the MatchResult row write while the
 *      fixture-close part is skipped (idempotent). A 3-member / 2-jornada
 *      league keeps the season STARTED after the concede so the RAU-40
 *      finished-league guard does not block the resolve.
 *
 * The non-live result form is untouched: `match-report.spec.ts` keeps covering
 * it (the manual form remains for NON-live matches and corrections).
 */
test.setTimeout(240_000);

const PASSWORD = "password-123";
const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

function tight(page: Page) {
  page.setDefaultTimeout(12_000);
  return page;
}

async function signup(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByLabel("Nombre").fill("Entrenador E2E");
  await page.getByRole("button", { name: "Registrarse" }).last().click();
  await expect(page).toHaveURL("/");
}

async function createTeam(page: Page, name: string) {
  await page.goto("/teams/create");
  await page.getByLabel("Nombre del equipo").fill(name);
  await page.getByLabel("Raza").selectOption("human");
  await page.getByRole("button", { name: "Siguiente →" }).click();
  const add = page.getByRole("button", { name: "Añadir Human Lineman" }).first();
  for (let i = 0; i < 11; i++) await add.click();
  await page.getByRole("button", { name: /crear equipo/i }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText(name)).toBeVisible();
}

/** One coach context: sign up, create a team, join the league. */
async function joinLeague(
  browser: Browser,
  email: string,
  teamName: string,
  leagueName: string,
): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext({ locale: "es-ES" });
  const page = tight(await context.newPage());
  try {
    await signup(page, email);
    await createTeam(page, teamName);
    await page.goto("/leagues");
    await page
      .locator("li")
      .filter({ hasText: leagueName })
      .getByRole("link", { name: "Ver", exact: true })
      .click();
    await page.getByLabel("Tu equipo").selectOption({ label: teamName });
    await page.getByRole("button", { name: "Apuntarse" }).click();
    await expect(page.getByText(teamName)).toBeVisible();
    return { page, context };
  } catch (error) {
    await context.close();
    throw error;
  }
}

/** Builds a started league (A owns it + a team; B — and optionally C — join). */
async function buildLeague(
  browser: Browser,
  tag: string,
  rounds: number,
  memberCount: 2 | 3 = 2,
): Promise<{
  admin: Page;
  rival: Page;
  third?: Page;
  leagueId: string;
  teams: Record<string, Page>;
  close: () => Promise<void>;
}> {
  const contextA = await browser.newContext({ locale: "es-ES" });
  const admin = tight(await contextA.newPage());
  const contexts: BrowserContext[] = [contextA];
  const close = async () => {
    await Promise.all(contexts.map((c) => c.close().catch(() => undefined)));
  };

  try {
    await signup(admin, uniqueEmail(`lr-admin-${tag}`));
    const adminTeam = `LRA-${tag} ${Date.now()}`;
    await createTeam(admin, adminTeam);
    const leagueName = `LR Liga ${tag} ${Date.now()}`;
    await admin.goto("/leagues");
    await expect(admin.getByRole("heading", { level: 1, name: "Mis Ligas" })).toBeVisible();
    await admin.getByRole("button", { name: "+ Nueva liga" }).first().click();
    await admin.getByLabel("Nombre").fill(leagueName);
    await admin.getByRole("button", { name: "Crear liga" }).click();
    await expect(admin.getByText(leagueName)).toBeVisible();
    await admin
      .locator("li")
      .filter({ hasText: leagueName })
      .getByRole("link", { name: "Ver", exact: true })
      .click();
    await expect(admin).toHaveURL(/\/leagues\/.+$/);
    const leagueId = /\/leagues\/(.+)$/.exec(admin.url())?.[1];
    expect(leagueId).toBeDefined();
    await admin.getByLabel("Tu equipo").selectOption({ label: adminTeam });
    await admin.getByRole("button", { name: "Apuntarse" }).click();
    await expect(admin.getByText(adminTeam)).toBeVisible();

    const rivalTeam = `LRB-${tag} ${Date.now()}`;
    const rivalJoined = await joinLeague(
      browser,
      uniqueEmail(`lr-rival-${tag}`),
      rivalTeam,
      leagueName,
    );
    const rival = rivalJoined.page;
    contexts.push(rivalJoined.context);

    let third: Page | undefined;
    const thirdTeam = memberCount === 3 ? `LRC-${tag} ${Date.now()}` : undefined;
    if (memberCount === 3) {
      const thirdJoined = await joinLeague(browser, uniqueEmail(`lr-third-${tag}`), thirdTeam!, leagueName);
      third = thirdJoined.page;
      contexts.push(thirdJoined.context);
    }

    await admin.reload();
    const startButton = admin.getByRole("button", { name: "Iniciar liga" });
    await expect(startButton).toBeEnabled();
    await startButton.click();
    await expect(admin.getByRole("dialog", { name: "Iniciar liga" })).toBeVisible();
    await admin.getByLabel("¿Cuántas jornadas?").fill(String(rounds));
    await admin
      .getByRole("dialog", { name: "Iniciar liga" })
      .getByRole("button", { name: "Iniciar liga" })
      .click();
    await expect(admin.getByText("Iniciada")).toBeVisible();

    return {
      admin,
      rival,
      third,
      leagueId: leagueId as string,
      teams: {
        [adminTeam]: admin,
        [rivalTeam]: rival,
        ...(thirdTeam ? { [thirdTeam]: third! } : {}),
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

/** Returns the round-1 fixture + its two sides resolved to OWNER pages. */
async function roundOne(
  page: Page,
  leagueId: string,
  teams: Record<string, Page>,
): Promise<{
  fixtureId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScorerId: string;
  homePage: Page;
  awayPage: Page;
}> {
  const res = await page.request.get(`/api/leagues/${leagueId}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    fixtures: { id: string; round: number; homeTeamId: string; awayTeamId: string }[];
    teams: { id: string; name: string; roster: { id: string; name: string }[] }[];
  };
  const fixture = body.fixtures.find((f) => f.round === 1);
  expect(fixture).toBeDefined();
  const home = body.teams.find((t) => t.id === fixture!.homeTeamId);
  const away = body.teams.find((t) => t.id === fixture!.awayTeamId);
  expect(home && home.roster.length).toBeGreaterThan(0);
  expect(away && away.roster.length).toBeGreaterThan(0);
  const homePage = teams[home!.name];
  const awayPage = teams[away!.name];
  expect(homePage && awayPage).toBeTruthy();
  return {
    fixtureId: fixture!.id,
    homeTeamName: home!.name,
    awayTeamName: away!.name,
    homeScorerId: home!.roster[0].id,
    homePage,
    awayPage,
  };
}

/** API-driven live command returning the full view. */
async function liveCommand(
  page: Page,
  leagueId: string,
  fixtureId: string,
  data: unknown,
): Promise<{ status: string; half: number; turnNumber: number; activeSide: string }> {
  const res = await page.request.post(`/api/leagues/${leagueId}/fixtures/${fixtureId}/live`, { data });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { view: { status: string; half: number; turnNumber: number; activeSide: string } }).view;
}

/** Consents BOTH coaches (each from their OWN page) + begins the fixture. */
async function consentAndBegin(
  homePage: Page,
  awayPage: Page,
  leagueId: string,
  fixtureId: string,
) {
  await liveCommand(homePage, leagueId, fixtureId, { type: "consent", side: "home" });
  await liveCommand(awayPage, leagueId, fixtureId, { type: "consent", side: "away" });
  await liveCommand(homePage, leagueId, fixtureId, { type: "begin" });
}

/** Drives end-turns until half 2 turn 8 with the HOME side active (the last
 * turn of the match: half 1 = 16 turns home/away, half 2 starts with the away
 * side), then scores a HOME TD which auto-finishes the match (D5). Every
 * command is posted from the ACTIVE side's own coach page (the route enforces
 * the caller-side turn gate). Returns the final view. */
async function autoFinishByTurnEightTd(
  homePage: Page,
  awayPage: Page,
  leagueId: string,
  fixtureId: string,
  homeScorerId: string,
): Promise<{ status: string; half: number; turnNumber: number }> {
  let view = await liveCommand(homePage, leagueId, fixtureId, { type: "endTurn", side: "home" });
  // 31 end-turns reach home T8 in half 2 under the round-shared turn semantics
  // (home T1 → away T1 → home T2 … away T8 half 1 → away T1 half 2 … away T8 →
  // home T8); drive to the target state defensively.
  for (let i = 0; i < 40; i++) {
    if (view.half === 2 && view.turnNumber === 8 && view.activeSide === "home") break;
    const page = view.activeSide === "home" ? homePage : awayPage;
    view = await liveCommand(page, leagueId, fixtureId, {
      type: "endTurn",
      side: view.activeSide,
    });
  }
  expect(view.half).toBe(2);
  expect(view.turnNumber).toBe(8);
  expect(view.activeSide).toBe("home");
  return liveCommand(homePage, leagueId, fixtureId, {
    type: "td",
    side: "home",
    playerRosterId: homeScorerId,
  });
}

/** Opens the resolution modal (auto-open tolerant) on a coach's OWN page. */
async function openResolution(page: Page, matchUrl: string) {
  await page.goto(matchUrl);
  const dialog = page.getByRole("dialog", { name: "Resolver partido" });
  try {
    await dialog.waitFor({ state: "visible", timeout: 8_000 });
  } catch {
    await page.getByRole("button", { name: "Resolver partido" }).click();
    await expect(dialog).toBeVisible();
  }
  return dialog;
}

/**
 * RAU-51: a coach nominates THEIR OWN side from their own page. Asserts the
 * per-side contract: only the viewer's OWN six pickers exist (the rival side
 * is a read-only status, never their players) and the roll stays disabled
 * until BOTH sides have submitted. Saves via "Guardar mis nominaciones" and
 * returns the dialog for the roll/save steps.
 */
async function nominateOwnSide(
  page: Page,
  ownTeamName: string,
  rivalTeamName: string,
  matchUrl: string,
) {
  const dialog = await openResolution(page, matchUrl);
  // The rival's pickers are NOT editable for this coach — only their own six.
  for (let i = 1; i <= 6; i++) {
    await expect(dialog.getByLabel(`MVP ${i} ${ownTeamName}`)).toBeVisible();
    await expect(dialog.getByLabel(`MVP ${i} ${rivalTeamName}`)).toHaveCount(0);
  }
  // The roll is gated on BOTH sides' submissions.
  await expect(dialog.getByRole("button", { name: "Tirar MVP" })).toBeDisabled();
  for (let i = 1; i <= 6; i++) {
    await dialog.getByLabel(`MVP ${i} ${ownTeamName}`).selectOption({ index: i });
  }
  await dialog.getByRole("button", { name: "Guardar mis nominaciones" }).click();
  await expect(dialog.getByText("Nominaciones enviadas")).toBeVisible();
  return dialog;
}

/** RAU-51: once BOTH sides nominated, the server-owned roll → resolve close. */
async function rollAndResolve(dialog: ReturnType<Page["getByRole"]>) {
  await expect(dialog.getByRole("button", { name: "Tirar MVP" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Tirar MVP" }).click();
  await expect(dialog.getByText("Resumen de la resolución")).toBeVisible();
  await dialog.getByRole("button", { name: "Guardar y reportar" }).click();
  await expect(dialog).not.toBeVisible();
}

/** RAU-51: the full per-side resolution — each coach nominates their own side
 * from their OWN page, then the roll + resolve close the match. */
async function resolvePerSide(
  homePage: Page,
  awayPage: Page,
  homeTeamName: string,
  awayTeamName: string,
  matchUrl: string,
) {
  await nominateOwnSide(homePage, homeTeamName, awayTeamName, matchUrl);
  const awayDialog = await nominateOwnSide(awayPage, awayTeamName, homeTeamName, matchUrl);
  // The second coach sees the rival's submission (status only — never the picks).
  await expect(awayDialog.getByText("El rival nominó 6 jugadores")).toBeVisible();
  await rollAndResolve(awayDialog);
}

/** Polls the league detail until the fixture is played and its round complete. */
async function waitFixturePlayed(
  page: Page,
  leagueId: string,
  fixtureId: string,
  round: number,
) {
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/leagues/${leagueId}`);
        if (res.status() !== 200) return null;
        const body = (await res.json()) as {
          fixtures: { id: string; status?: string; round: number }[];
          rounds: { round: number; complete: boolean }[];
        };
        const fixture = body.fixtures.find((f) => f.id === fixtureId);
        const roundComplete = body.rounds.find((r) => r.round === round)?.complete;
        return fixture?.status === "played" && roundComplete === true ? "played" : null;
      },
      { timeout: 20_000 },
    )
    .toBe("played");
}

test("endMatch → resolve closes the fixture, writes the result and completes the jornada", async ({ browser }) => {
  const tag = Date.now().toString(36);
  const league = await buildLeague(browser, tag, 1);
  try {
    const { admin, leagueId, teams } = league;
    const { fixtureId, homeTeamName, awayTeamName, homePage, awayPage } = await roundOne(admin, leagueId, teams);
    await consentAndBegin(homePage, awayPage, leagueId, fixtureId);

    // End the match explicitly (admin MayEnd) → the resolution flow shows.
    const afterEnd = await liveCommand(admin, leagueId, fixtureId, { type: "endMatch" });
    expect(afterEnd.status).toBe("finished");

    // Resolve through the modal → the fixture closes + the result writes.
    const matchUrl = `/leagues/${leagueId}/fixtures/${fixtureId}`;
    await admin.goto(matchUrl);
    await expect(admin.getByRole("button", { name: "Resolver partido" })).toBeVisible();
    await resolvePerSide(homePage, awayPage, homeTeamName, awayTeamName, matchUrl);
    // The admin page re-loads the RESOLVED match (whichever coach did the final
    // save) so the feed shows the closure summary deterministically.
    await admin.goto(matchUrl);

    // THE CLOSURE: the fixture is played, the result row exists with winnings,
    // the round completes and the feed shows the MVP rows + reported summary.
    await waitFixturePlayed(admin, leagueId, fixtureId, 1);

    const detail = await admin.request.get(`/api/leagues/${leagueId}/fixtures/${fixtureId}`);
    expect(detail.status()).toBe(200);
    const body = (await detail.json()) as {
      fixture: { status: string; homeScore: number | null; awayScore: number | null };
      result: { scores: { home: { winnings: number }; away: { winnings: number } } } | null;
    };
    expect(body.fixture.status).toBe("played");
    expect(body.fixture.homeScore).not.toBeNull();
    expect(body.fixture.awayScore).not.toBeNull();
    expect(body.result).not.toBeNull();
    expect(body.result!.scores.home.winnings).toBeGreaterThan(0);

    // MVP rows (★4) + "Partido reportado" on the match page.
    await expect(admin.getByText("Jugador más valioso").first()).toBeVisible();
    await expect(
      admin.getByTestId("live-event-row").filter({ hasText: "Jugador más valioso" }).filter({ hasText: "★4" }),
    ).toHaveCount(2);
    await expect(
      admin.getByTestId("summary-row-reported").filter({ hasText: "Partido reportado" }),
    ).toBeVisible();

    // Jornada completa on the league page.
    await admin.goto(`/leagues/${leagueId}`);
    const region = admin.getByRole("region", { name: "Jornada 1" });
    await expect(region.getByText(/Partido 1 · Jugado/)).toBeVisible();
    await expect(admin.getByText("Jornada completa")).toBeVisible();
  } finally {
    await league.close();
  }
});

test("auto-finish (TD in half-2 turn 8) → the resolve closure still runs", async ({ browser }) => {
  const tag = Date.now().toString(36);
  const league = await buildLeague(browser, tag, 1);
  try {
    const { admin, leagueId, teams } = league;
    const { fixtureId, homeTeamName, awayTeamName, homeScorerId, homePage, awayPage } = await roundOne(admin, leagueId, teams);
    await consentAndBegin(homePage, awayPage, leagueId, fixtureId);

    // Drive to half 2 turn 8 (home active) then a HOME TD → the match AUTO-
    // finishes (D5).
    const afterTd = await autoFinishByTurnEightTd(homePage, awayPage, leagueId, fixtureId, homeScorerId);
    expect(afterTd.status).toBe("finished");

    // Resolve through the modal → fixture played + round complete.
    const matchUrl = `/leagues/${leagueId}/fixtures/${fixtureId}`;
    await admin.goto(matchUrl);
    await expect(admin.getByRole("button", { name: "Resolver partido" })).toBeVisible();
    await resolvePerSide(homePage, awayPage, homeTeamName, awayTeamName, matchUrl);
    await admin.goto(matchUrl);

    await waitFixturePlayed(admin, leagueId, fixtureId, 1);
    await expect(
      admin.getByTestId("summary-row-reported").filter({ hasText: "Partido reportado" }),
    ).toBeVisible();
    await expect(
      admin.getByTestId("live-event-row").filter({ hasText: "Jugador más valioso" }).filter({ hasText: "★4" }),
    ).toHaveCount(2);

    await admin.goto(`/leagues/${leagueId}`);
    await expect(admin.getByText("Jornada completa")).toBeVisible();
  } finally {
    await league.close();
  }
});

test("RAU-12: a lasting casualty suspends the victim for the next match until it resolves; a bruise never blocks", async ({ browser }) => {
  // A 3-member, 2-jornada league: the pivot team plays BOTH rounds, so a
  // round-1 lasting casualty can be asserted as UNAVAILABLE in round 2's FAB,
  // and available again once round 2 resolves (served flag clears).
  const tag = Date.now().toString(36);
  const league = await buildLeague(browser, tag, 2, 3);
  try {
    const { admin, leagueId, teams } = league;
    const r1 = await roundOne(admin, leagueId, teams);

    // Resolve both fixtures + the pivot team (the one present in BOTH rounds).
    const detail = await admin.request.get(`/api/leagues/${leagueId}`);
    expect(detail.status()).toBe(200);
    const body = (await detail.json()) as {
      fixtures: { id: string; round: number; homeTeamId: string; awayTeamId: string }[];
      teams: { id: string; name: string; roster: { id: string; name: string }[] }[];
    };
    const r1Fixture = body.fixtures.find((f) => f.round === 1)!;
    const r2Fixture = body.fixtures.find((f) => f.round === 2)!;
    const pivotTeamId = [r1Fixture.homeTeamId, r1Fixture.awayTeamId].find(
      (id) => id === r2Fixture.homeTeamId || id === r2Fixture.awayTeamId,
    )!;
    const pivotTeam = body.teams.find((t) => t.id === pivotTeamId)!;
    const pivotPage = teams[pivotTeam.name];
    const lastingVictimId = pivotTeam.roster[0].id;
    const lastingVictimName = pivotTeam.roster[0].name;
    const bruiseVictimId = pivotTeam.roster[1].id;
    const bruiseVictimName = pivotTeam.roster[1].name;
    // Round 1's proposer is the coach on the side OPPOSITE the pivot.
    const proposerSide: "home" | "away" = r1Fixture.homeTeamId === pivotTeamId ? "away" : "home";
    const proposerPage = proposerSide === "home" ? r1.homePage : r1.awayPage;
    const proposerTeamId = proposerSide === "home" ? r1Fixture.homeTeamId : r1Fixture.awayTeamId;
    const proposerTeam = body.teams.find((t) => t.id === proposerTeamId)!;
    const causerId = proposerTeam.roster[0].id;

    // --- Match 1: consent + begin, drive to the proposer's turn, then record a
    // lasting casualty (1D16 9 → apaleado) AND a bruise (1D16 2) on pivot players.
    await liveCommand(r1.homePage, leagueId, r1.fixtureId, { type: "consent", side: "home" });
    await liveCommand(r1.awayPage, leagueId, r1.fixtureId, { type: "consent", side: "away" });
    let view = await liveCommand(r1.homePage, leagueId, r1.fixtureId, { type: "begin" });
    while (view.activeSide !== proposerSide) {
      const activePage = view.activeSide === "home" ? r1.homePage : r1.awayPage;
      view = await liveCommand(activePage, leagueId, r1.fixtureId, { type: "endTurn", side: view.activeSide });
    }
    expect(view.activeSide).toBe(proposerSide);

    await liveCommand(proposerPage, leagueId, r1.fixtureId, {
      type: "proposeCasualty", victimRosterId: lastingVictimId, causerRosterId: causerId, cause: "blitz", roll16: 9,
    });
    await liveCommand(pivotPage, leagueId, r1.fixtureId, { type: "confirmCasualty" });
    await liveCommand(proposerPage, leagueId, r1.fixtureId, {
      type: "proposeCasualty", victimRosterId: bruiseVictimId, causerRosterId: causerId, cause: "blitz", roll16: 2,
    });
    await liveCommand(pivotPage, leagueId, r1.fixtureId, { type: "confirmCasualty" });

    // Resolve match 1 → the lasting victim is flagged, the bruise is not.
    const afterEnd = await liveCommand(admin, leagueId, r1.fixtureId, { type: "endMatch" });
    expect(afterEnd.status).toBe("finished");
    await admin.goto(`/leagues/${leagueId}/fixtures/${r1.fixtureId}`);
    await expect(admin.getByRole("button", { name: "Resolver partido" })).toBeVisible();
    await resolvePerSide(r1.homePage, r1.awayPage, r1.homeTeamName, r1.awayTeamName, `/leagues/${leagueId}/fixtures/${r1.fixtureId}`);
    await admin.goto(`/leagues/${leagueId}/fixtures/${r1.fixtureId}`);
    await waitFixturePlayed(admin, leagueId, r1.fixtureId, 1);

    const after1 = await admin.request.get(`/api/leagues/${leagueId}/fixtures/${r1.fixtureId}`);
    expect(after1.status()).toBe(200);
    const b1 = (await after1.json()) as {
      homeTeam: { players: { rosterPlayerId: string; missNextMatch: boolean }[] };
      awayTeam: { players: { rosterPlayerId: string; missNextMatch: boolean }[] };
    };
    const pivotSide1 = r1Fixture.homeTeamId === pivotTeamId ? b1.homeTeam : b1.awayTeam;
    expect(pivotSide1.players.find((p) => p.rosterPlayerId === lastingVictimId)!.missNextMatch).toBe(true);
    expect(pivotSide1.players.find((p) => p.rosterPlayerId === bruiseVictimId)!.missNextMatch).toBe(false);

    // --- Match 2 (the pivot team plays again): consent + begin, drive to the
    // pivot's turn, then assert the FAB pools from the pivot coach's page.
    const home2Name = body.teams.find((t) => t.id === r2Fixture.homeTeamId)!.name;
    const away2Name = body.teams.find((t) => t.id === r2Fixture.awayTeamId)!.name;
    const home2Page = teams[home2Name];
    const away2Page = teams[away2Name];
    const pivotSide2: "home" | "away" = r2Fixture.homeTeamId === pivotTeamId ? "home" : "away";

    await liveCommand(home2Page, leagueId, r2Fixture.id, { type: "consent", side: "home" });
    await liveCommand(away2Page, leagueId, r2Fixture.id, { type: "consent", side: "away" });
    view = await liveCommand(home2Page, leagueId, r2Fixture.id, { type: "begin" });
    while (view.activeSide !== pivotSide2) {
      const activePage = view.activeSide === "home" ? home2Page : away2Page;
      view = await liveCommand(activePage, leagueId, r2Fixture.id, { type: "endTurn", side: view.activeSide });
    }
    expect(view.activeSide).toBe(pivotSide2);

    await pivotPage.goto(`/leagues/${leagueId}/fixtures/${r2Fixture.id}`);
    await expect(pivotPage.getByRole("button", { name: "+" })).toBeVisible();
    await pivotPage.getByRole("button", { name: "+" }).click();
    await pivotPage.getByRole("button", { name: /Touchdown/i }).click();
    const tdOptions = await pivotPage
      .getByLabel("Jugador", { exact: true })
      .locator("option")
      .allTextContents();
    // The suspended victim is NOT selectable; the bruised one IS.
    expect(tdOptions.some((o) => o.includes(lastingVictimName))).toBe(false);
    expect(tdOptions.some((o) => o.includes(bruiseVictimName))).toBe(true);

    // Resolve match 2 → the suspension is SERVED: both players are available again.
    const afterEnd2 = await liveCommand(admin, leagueId, r2Fixture.id, { type: "endMatch" });
    expect(afterEnd2.status).toBe("finished");
    await admin.goto(`/leagues/${leagueId}/fixtures/${r2Fixture.id}`);
    await expect(admin.getByRole("button", { name: "Resolver partido" })).toBeVisible();
    await resolvePerSide(home2Page, away2Page, home2Name, away2Name, `/leagues/${leagueId}/fixtures/${r2Fixture.id}`);
    await admin.goto(`/leagues/${leagueId}/fixtures/${r2Fixture.id}`);
    await waitFixturePlayed(admin, leagueId, r2Fixture.id, 2);

    const after2 = await admin.request.get(`/api/leagues/${leagueId}/fixtures/${r2Fixture.id}`);
    expect(after2.status()).toBe(200);
    const b2 = (await after2.json()) as {
      homeTeam: { players: { rosterPlayerId: string; missNextMatch: boolean }[] };
      awayTeam: { players: { rosterPlayerId: string; missNextMatch: boolean }[] };
    };
    const pivotSide2Served = r2Fixture.homeTeamId === pivotTeamId ? b2.homeTeam : b2.awayTeam;
    expect(pivotSide2Served.players.find((p) => p.rosterPlayerId === lastingVictimId)!.missNextMatch).toBe(false);
    expect(pivotSide2Served.players.find((p) => p.rosterPlayerId === bruiseVictimId)!.missNextMatch).toBe(false);
  } finally {
    await league.close();
  }
});

test("RAU-13: a <11 lineup gets Journeymen (notice + selectable FAB + earned PE carried on hire)", async ({ browser }) => {
  // A 3-member, 2-jornada league: the pivot team plays BOTH rounds, so a
  // round-1 lasting casualty makes it field 10 available players in round 2 —
  // the match then provides a Journeyman (Novato) for that match only.
  // (2 rounds need 3 teams: the round-robin season length is at most teams−1.)
  const tag = Date.now().toString(36);
  const league = await buildLeague(browser, tag, 2, 3);
  try {
    const { admin, leagueId, teams } = league;
    const r1 = await roundOne(admin, leagueId, teams);

    const detail = await admin.request.get(`/api/leagues/${leagueId}`);
    expect(detail.status()).toBe(200);
    const body = (await detail.json()) as {
      fixtures: { id: string; round: number; homeTeamId: string; awayTeamId: string }[];
      teams: { id: string; name: string; roster: { id: string; name: string }[] }[];
    };
    const r1Fixture = body.fixtures.find((f) => f.round === 1)!;
    const r2Fixture = body.fixtures.find((f) => f.round === 2)!;
    const pivotTeamId = [r1Fixture.homeTeamId, r1Fixture.awayTeamId].find(
      (id) => id === r2Fixture.homeTeamId || id === r2Fixture.awayTeamId,
    )!;
    const pivotTeam = body.teams.find((t) => t.id === pivotTeamId)!;
    const pivotPage = teams[pivotTeam.name];
    const victimId = pivotTeam.roster[0].id;
    const proposerSide: "home" | "away" = r1Fixture.homeTeamId === pivotTeamId ? "away" : "home";
    const proposerPage = proposerSide === "home" ? r1.homePage : r1.awayPage;
    const proposerTeamId = proposerSide === "home" ? r1Fixture.homeTeamId : r1Fixture.awayTeamId;
    const proposerTeam = body.teams.find((t) => t.id === proposerTeamId)!;
    const causerId = proposerTeam.roster[0].id;

    // --- Match 1: consent + begin, drive to the proposer's turn, record TWO
    // lasting casualties (1D16 9 → apaleado) on the pivot team — round 2 will
    // then field only 9 available players → 2 Journeymen (RAU-13/RAU-14).
    await liveCommand(r1.homePage, leagueId, r1.fixtureId, { type: "consent", side: "home" });
    await liveCommand(r1.awayPage, leagueId, r1.fixtureId, { type: "consent", side: "away" });
    let view = await liveCommand(r1.homePage, leagueId, r1.fixtureId, { type: "begin" });
    while (view.activeSide !== proposerSide) {
      const activePage = view.activeSide === "home" ? r1.homePage : r1.awayPage;
      view = await liveCommand(activePage, leagueId, r1.fixtureId, { type: "endTurn", side: view.activeSide });
    }
    const victim2Id = pivotTeam.roster[1].id;
    await liveCommand(proposerPage, leagueId, r1.fixtureId, {
      type: "proposeCasualty", victimRosterId: victimId, causerRosterId: causerId, cause: "blitz", roll16: 9,
    });
    await liveCommand(pivotPage, leagueId, r1.fixtureId, { type: "confirmCasualty" });
    await liveCommand(proposerPage, leagueId, r1.fixtureId, {
      type: "proposeCasualty", victimRosterId: victim2Id, causerRosterId: causerId, cause: "blitz", roll16: 9,
    });
    await liveCommand(pivotPage, leagueId, r1.fixtureId, { type: "confirmCasualty" });

    const afterEnd = await liveCommand(admin, leagueId, r1.fixtureId, { type: "endMatch" });
    expect(afterEnd.status).toBe("finished");
    await admin.goto(`/leagues/${leagueId}/fixtures/${r1.fixtureId}`);
    await expect(admin.getByRole("button", { name: "Resolver partido" })).toBeVisible();
    await resolvePerSide(r1.homePage, r1.awayPage, r1.homeTeamName, r1.awayTeamName, `/leagues/${leagueId}/fixtures/${r1.fixtureId}`);
    await admin.goto(`/leagues/${leagueId}/fixtures/${r1.fixtureId}`);
    await waitFixturePlayed(admin, leagueId, r1.fixtureId, 1);

    // --- Match 2: the pivot team fields 9 available → the GET serves TWO
    // Journeymen (synthetic ids, Novato names, the race's lineman positional).
    const home2Name = body.teams.find((t) => t.id === r2Fixture.homeTeamId)!.name;
    const away2Name = body.teams.find((t) => t.id === r2Fixture.awayTeamId)!.name;
    const home2Page = teams[home2Name];
    const away2Page = teams[away2Name];
    const pivotSide2: "home" | "away" = r2Fixture.homeTeamId === pivotTeamId ? "home" : "away";

    const served = await admin.request.get(`/api/leagues/${leagueId}/fixtures/${r2Fixture.id}`);
    expect(served.status()).toBe(200);
    const servedBody = (await served.json()) as {
      homeTeam: { players: { rosterPlayerId: string; name: string; positionalKey: string; journeyman?: boolean }[] };
      awayTeam: { players: { rosterPlayerId: string; name: string; positionalKey: string; journeyman?: boolean }[] };
    };
    const pivotServed = pivotSide2 === "home" ? servedBody.homeTeam.players : servedBody.awayTeam.players;
    const jrnyList = pivotServed.filter((p) => p.journeyman === true);
    expect(jrnyList).toHaveLength(2);
    const jrny = jrnyList[0];
    const jrny2 = jrnyList[1];
    const jrnyName = jrny!.name;
    const jrnyName2 = jrny2!.name;
    // RAU-13: the Novatos carry RACE-BANK names ("First Surname" style, never
    // the old "Novato N") while still being flagged journeyman for the match.
    expect(jrnyName).not.toMatch(/^Novato\b/);
    expect(jrnyName2).not.toMatch(/^Novato\b/);
    expect(jrnyName).not.toBe(jrnyName2);
    expect(jrnyName.length).toBeGreaterThan(0);
    expect(jrny!.positionalKey).toBe("lineman");
    expect(jrny2!.positionalKey).toBe("lineman");
    expect(jrny!.rosterPlayerId).toBe(`journeyman-${pivotTeamId}-1`);
    expect(jrny2!.rosterPlayerId).toBe(`journeyman-${pivotTeamId}-2`);

    // The names are deterministic for the match: re-reading the same fixture GET
    // (the served DTO is recomputed per request) serves the SAME novato names.
    const servedAgain = await admin.request.get(`/api/leagues/${leagueId}/fixtures/${r2Fixture.id}`);
    expect(servedAgain.status()).toBe(200);
    const servedAgainBody = (await servedAgain.json()) as {
      homeTeam: { players: { rosterPlayerId: string; name: string; journeyman?: boolean }[] };
      awayTeam: { players: { rosterPlayerId: string; name: string; journeyman?: boolean }[] };
    };
    const pivotServedAgain =
      pivotSide2 === "home" ? servedAgainBody.homeTeam.players : servedAgainBody.awayTeam.players;
    const jrnyNamesAgain = pivotServedAgain.filter((p) => p.journeyman === true).map((p) => p.name);
    expect(jrnyNamesAgain).toContain(jrnyName);
    expect(jrnyNamesAgain).toContain(jrnyName2);

    await liveCommand(home2Page, leagueId, r2Fixture.id, { type: "consent", side: "home" });
    await liveCommand(away2Page, leagueId, r2Fixture.id, { type: "consent", side: "away" });
    view = await liveCommand(home2Page, leagueId, r2Fixture.id, { type: "begin" });
    while (view.activeSide !== pivotSide2) {
      const activePage = view.activeSide === "home" ? home2Page : away2Page;
      view = await liveCommand(activePage, leagueId, r2Fixture.id, { type: "endTurn", side: view.activeSide });
    }
    expect(view.activeSide).toBe(pivotSide2);

    // The match page shows the notice, the timeline journals the novato joining
    // ("{name} se une como novato"), and the Journeyman is selectable in the
    // FAB (marked Novato with its dorsal). Record a TD with the Novato through
    // the REAL FAB.
    const match2Url = `/leagues/${leagueId}/fixtures/${r2Fixture.id}`;
    await pivotPage.goto(match2Url);
    await expect(pivotPage.getByTestId("journeymen-notice")).toBeVisible();
    await expect(pivotPage.getByText("Faltan 2 jugadores — se añaden 2 novatos")).toBeVisible();
    // RAU-13: the join timeline event lists BOTH novatos on ONE plural row.
    await expect(
      pivotPage
        .getByTestId("live-event-row")
        .filter({ hasText: `${jrnyName}, ${jrnyName2} se unen como novatos` })
        .first(),
    ).toBeVisible();
    await expect(pivotPage.getByRole("button", { name: "+" })).toBeVisible();
    await pivotPage.getByRole("button", { name: "+" }).click();
    await pivotPage.getByRole("button", { name: /Touchdown/i }).click();
    const tdSelect = pivotPage.getByLabel("Jugador", { exact: true });
    // The novato options read "Name (Novato · #N)" — dorsal = served index + 1.
    const jrnyOption = tdSelect.locator("option", { hasText: jrnyName });
    await expect(jrnyOption).toHaveCount(1);
    expect((await jrnyOption.textContent()) ?? "").toMatch(/\(Novato · #\d+\)$/);
    await tdSelect.selectOption(jrny!.rosterPlayerId);
    await pivotPage.getByRole("button", { name: "Registrar" }).click();
    await expect(pivotPage.getByLabel("Jugador", { exact: true })).toHaveCount(0);

    // The TD flips the turn to the OPPOSITE coach — have them injure the
    // Journeyman (1D16 9 → apaleado, lasting); the pivot confirms. RAU-13: the
    // casualty VICTIM is a served Novato, so the snapshot + the hire must both
    // carry the injury.
    const opponentTeamId = pivotSide2 === "home" ? r2Fixture.awayTeamId : r2Fixture.homeTeamId;
    const opponentTeamRow = body.teams.find((t) => t.id === opponentTeamId)!;
    const opponentCauserId = opponentTeamRow.roster[0].id;
    const opponentPage = pivotSide2 === "home" ? away2Page : home2Page;
    // The FAB closes immediately (its TD POST is fire-and-forget), so wait for
    // the TD to LAND before the opponent proposes — a raced propose reads the
    // pre-TD state (pivot still active) and 409s out-of-turn.
    await expect
      .poll(
        async () => {
          const liveState = await opponentPage.request.get(`/api/leagues/${leagueId}/fixtures/${r2Fixture.id}`);
          const body = (await liveState.json()) as { live: { homeScore: number; awayScore: number } | null };
          return body.live != null && (pivotSide2 === "home" ? body.live.homeScore : body.live.awayScore) === 1;
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    await liveCommand(opponentPage, leagueId, r2Fixture.id, {
      type: "proposeCasualty", victimRosterId: jrny!.rosterPlayerId, causerRosterId: opponentCauserId, cause: "blitz", roll16: 9,
    });
    await liveCommand(pivotPage, leagueId, r2Fixture.id, { type: "confirmCasualty" });

    // Resolve match 2 → the closure writes the awards: the Novato's TD earned
    // PE (snapshot) while NO Player row exists for them yet.
    // endMatch is an optimistic-guard write: a hub-driven pause transition can
    // race it (seq conflict → 409, the transition rolls back), so retry once —
    // the same way a user would simply click again — and accept an already-
    // finished live row (a raced "Invalid transition").
    let finished = false;
    for (let attempt = 0; attempt < 2 && !finished; attempt++) {
      const res = await admin.request.post(
        `/api/leagues/${leagueId}/fixtures/${r2Fixture.id}/live`,
        { data: { type: "endMatch" } },
      );
      if (res.status() === 200) {
        finished = ((await res.json()) as { view: { status: string } }).view.status === "finished";
      }
    }
    if (!finished) {
      const liveState = await admin.request.get(`/api/leagues/${leagueId}/fixtures/${r2Fixture.id}`);
      finished = ((await liveState.json()) as { live: { status: string } | null }).live?.status === "finished";
    }
    expect(finished).toBe(true);
    await admin.goto(match2Url);
    await expect(admin.getByRole("button", { name: "Resolver partido" })).toBeVisible();
    await resolvePerSide(home2Page, away2Page, home2Name, away2Name, match2Url);
    await admin.goto(match2Url);
    await waitFixturePlayed(admin, leagueId, r2Fixture.id, 2);

    // The season's LAST match just resolved → the league finished ATOMICALLY
    // (RAU-40). The post-resolve hire must STILL work on the finished league
    // (RAU-14: the finished-league guard exempts hireJourneyman) — this is the
    // exact journey the user runs and the regression the fix must not return.
    const leagueStatus = await admin.request.get(`/api/leagues/${leagueId}`);
    expect(leagueStatus.status()).toBe(200);
    const seasonBody = (await leagueStatus.json()) as { status: string };
    expect(seasonBody.status).toBe("finished");

    // --- RAU-14: after the match is REPORTED, the hire step appears on the
    // PIVOT coach's OWN page — one offer per remaining journeyman, with the
    // race Lineman cost (Human Lineman = 50.000 M.O.).
    await pivotPage.goto(match2Url);
    const hirePanel = pivotPage.getByTestId("journeymen-hire");
    await expect(hirePanel).toBeVisible();
    await expect(hirePanel.getByText(new RegExp(`${jrnyName}`))).toBeVisible();
    await expect(hirePanel.getByText(new RegExp(`${jrnyName2}`))).toBeVisible();
    await expect(hirePanel.getByText(/puede quedarse por 50\.000 M\.O\./)).toHaveCount(2);

    // Treasury BEFORE the decisions (the resolve winnings were already applied).
    const beforeRes = await admin.request.get(`/api/leagues/${leagueId}`);
    expect(beforeRes.status()).toBe(200);
    const beforeBody = (await beforeRes.json()) as {
      teams: { id: string; treasury: number; roster: { id: string; name: string; positionalKey: string }[] }[];
    };
    const pivotBefore = beforeBody.teams.find((t) => t.id === pivotTeamId)!;
    const treasuryBefore = pivotBefore.treasury;
    expect(pivotBefore.roster).toHaveLength(11);

    // "Contratar" the FIRST journeyman → the roster gains them (reload
    // persists), the treasury drops by the lineman cost and the option vanishes.
    await hirePanel
      .locator("li")
      .filter({ hasText: jrnyName })
      .getByRole("button", { name: "Contratar" })
      .click();
    await expect(pivotPage.getByTestId("journeymen-hire")).toBeVisible();
    await expect(hirePanel.getByText(new RegExp(jrnyName))).toHaveCount(0);
    await expect(hirePanel.getByText(new RegExp(jrnyName2))).toBeVisible();

    const afterHire = await admin.request.get(`/api/leagues/${leagueId}`);
    expect(afterHire.status()).toBe(200);
    const afterHireBody = (await afterHire.json()) as {
      teams: { id: string; treasury: number; roster: { id: string; name: string; positionalKey: string }[] }[];
    };
    const pivotAfterHire = afterHireBody.teams.find((t) => t.id === pivotTeamId)!;
    expect(pivotAfterHire.roster).toHaveLength(12);
    const hired = pivotAfterHire.roster.find((p) => p.name === jrnyName);
    expect(hired).toBeTruthy();
    expect(hired!.positionalKey).toBe("lineman");
    expect(pivotAfterHire.roster.some((p) => p.name === jrnyName2)).toBe(false);
    // The hire is PAID via the balance formula: the roster grows (rosterCost),
    // so `computeSpendableBalance` drops by the Lineman cost — the treasury
    // ledger itself does NOT change (RAU-11 convention, no double-count).
    expect(pivotAfterHire.treasury).toBe(treasuryBefore);

    // A reload shows the hired novato is GONE from the offers (persisted) while
    // the second offer remains — the decision survives the reload.
    await pivotPage.reload();
    const hirePanelReload = pivotPage.getByTestId("journeymen-hire");
    await expect(hirePanelReload).toBeVisible();
    await expect(hirePanelReload.getByText(new RegExp(jrnyName2))).toBeVisible();
    await expect(hirePanelReload.getByText(new RegExp(jrnyName))).toHaveCount(0);

    // "Dejar ir" the SECOND journeyman → the option is gone and NO roster or
    // treasury change happens (the panel disappears when none remain).
    await hirePanelReload
      .locator("li")
      .filter({ hasText: jrnyName2 })
      .getByRole("button", { name: "Dejar ir" })
      .click();
    await expect(pivotPage.getByTestId("journeymen-hire")).not.toBeVisible();

    const afterLetGo = await admin.request.get(`/api/leagues/${leagueId}`);
    expect(afterLetGo.status()).toBe(200);
    const afterLetGoBody = (await afterLetGo.json()) as {
      teams: { id: string; treasury: number; roster: { id: string; name: string; positionalKey: string }[] }[];
    };
    const pivotAfterLetGo = afterLetGoBody.teams.find((t) => t.id === pivotTeamId)!;
    expect(pivotAfterLetGo.roster).toHaveLength(12);
    expect(pivotAfterLetGo.roster.some((p) => p.name === jrnyName2)).toBe(false);
    // "Dejar ir" never touches the team — the ledger stays exactly where the
    // paid hire left it (RAU-14 balance formula: the hire dropped spendable
    // balance via rosterCost growth, not the treasury).
    expect(pivotAfterLetGo.treasury).toBe(treasuryBefore);

    const after = await admin.request.get(`/api/leagues/${leagueId}/fixtures/${r2Fixture.id}`);
    expect(after.status()).toBe(200);
    const afterBody = (await after.json()) as {
      result: {
        scores: {
          home: {
            pe: { rosterPlayerId: string; pe: number }[];
            casualties: { rosterPlayerId: string; outcome?: { kind?: string } }[];
          };
          away: {
            pe: { rosterPlayerId: string; pe: number }[];
            casualties: { rosterPlayerId: string; outcome?: { kind?: string } }[];
          };
        };
      };
    };
    const pivotScoreboard = pivotSide2 === "home" ? afterBody.result.scores.home : afterBody.result.scores.away;
    // RAU-13: the Novato's TD earned ★3 PE and their id IS in the snapshot;
    // the lasting injury they suffered is documented there too (the hire
    // carries both into the new Player row).
    const jrnyPe = pivotScoreboard.pe.find((row) => row.rosterPlayerId === jrny!.rosterPlayerId);
    expect(jrnyPe).toBeDefined();
    expect(jrnyPe!.pe).toBe(3);
    expect(
      pivotScoreboard.casualties.some(
        (c) => c.rosterPlayerId === jrny!.rosterPlayerId && c.outcome?.kind === "apaleado",
      ),
    ).toBe(true);

    // RAU-13: the HIRED journeyman keeps their earned PE + injury on the new
    // Player row (keyed by the NEW roster id, with the RAU-12 suspension); the
    // let-go one leaves no trace. The progression route is owner-scoped →
    // request from the pivot coach.
    const hiredEntry = pivotAfterHire.roster.find((p) => p.name === jrnyName)!;
    const prog = await pivotPage.request.get(`/api/teams/${pivotTeamId}/progression`);
    expect(prog.status()).toBe(200);
    const progBody = (await prog.json()) as {
      rosterPlayerId: string;
      pe: number;
      injuries: { kind: string }[];
      missNextMatch: boolean;
    }[];
    const hiredRow = progBody.find((p) => p.rosterPlayerId === hiredEntry.id);
    expect(hiredRow).toBeDefined();
    expect(hiredRow!.pe).toBe(3);
    expect(hiredRow!.injuries.some((i) => i.kind === "apaleado")).toBe(true);
    expect(hiredRow!.missNextMatch).toBe(true);
    // The let-go journeyman never became a Player row and no synthetic id ever
    // does (the hired one carries the NEW roster id).
    expect(progBody.some((p) => p.rosterPlayerId.startsWith("journeyman-"))).toBe(false);

    // The team detail (owner) renders the hired Novato's row with the carried
    // PE (★3) + the injury badge (🩹x1) — the hire decision survives a reload.
    await pivotPage.goto(`/teams/${pivotTeamId}`);
    await expect(pivotPage.getByTestId(`spp-pe-${hiredEntry.id}`)).toHaveText("★3");
    await expect(pivotPage.getByTestId(`ni-${hiredEntry.id}`)).toContainText("🩹x1");
    const leagueAgain = await admin.request.get(`/api/leagues/${leagueId}`);
    expect(leagueAgain.status()).toBe(200);
    const leagueBody = (await leagueAgain.json()) as { teams: { id: string; roster: unknown[] }[] };
    expect(leagueBody.teams.find((t) => t.id === pivotTeamId)!.roster).toHaveLength(12);
  } finally {
    await league.close();
  }
});

test("concede → the resolution still runs (awards + MatchResult) though the fixture was already closed", async ({ browser }) => {
  const tag = Date.now().toString(36);
  // A 3-member, 2-jornada league: conceding round 1's fixture leaves the
  // season STARTED (round 2 pending) so the resolve — which the RAU-40
  // finished-league guard would otherwise block — is allowed.
  const league = await buildLeague(browser, tag, 2, 3);
  try {
    const { admin, leagueId, teams } = league;
    const { fixtureId, homeTeamName, awayTeamName, homePage, awayPage } = await roundOne(admin, leagueId, teams);
    await consentAndBegin(homePage, awayPage, leagueId, fixtureId);

    // The home coach proposes a concession; the away coach accepts it → the
    // fixture closes IMMEDIATELY (walkover 2-0, RAU-38) with NO MatchResult yet.
    await liveCommand(homePage, leagueId, fixtureId, { type: "concede" });
    const accepted = await liveCommand(awayPage, leagueId, fixtureId, { type: "concedeRespond", accept: true });
    expect(accepted.status).toBe("finished");

    const matchUrl = `/leagues/${leagueId}/fixtures/${fixtureId}`;
    await admin.goto(matchUrl);
    // The fixture is already closed, but the finished live match is NOT
    // resolved → the resolution flow still offers the awards + report.
    await expect(admin.getByRole("button", { name: "Resolver partido" })).toBeVisible();
    await resolvePerSide(homePage, awayPage, homeTeamName, awayTeamName, matchUrl);
    await admin.goto(matchUrl);

    // The MatchResult row exists with the walkover scoreboard (awards applied),
    // and round 1 completes while the season stays STARTED (round 2 pending).
    await waitFixturePlayed(admin, leagueId, fixtureId, 1);
    const detail = await admin.request.get(`/api/leagues/${leagueId}/fixtures/${fixtureId}`);
    expect(detail.status()).toBe(200);
    const body = (await detail.json()) as {
      fixture: { homeScore: number | null; awayScore: number | null; status: string };
      result: { scores: { home: { pe: { rosterPlayerId: string; pe: number }[] } } } | null;
    };
    expect(body.result).not.toBeNull();
    // The conceded walkover's scoreboard persisted (2-0 to the acceptor) plus
    // the PE awards derived from the events (each side's MVP +4 present).
    const peRows = [...(body.result?.scores.home.pe ?? [])];
    expect(peRows.some((row) => row.pe >= 4)).toBe(true);

    await admin.goto(`/leagues/${leagueId}`);
    // Round 1 is complete; the Jornadas default to the first INCOMPLETE round
    // (round 2), so switch to Jornada 1 for the completion badge.
    await admin.getByRole("tab", { name: "Jornada 1" }).click();
    await expect(admin.getByText("Jornada completa")).toBeVisible();
    // The season is NOT finished — a second fixture remains.
    await expect(admin.getByText("Finalizada", { exact: true })).toHaveCount(0);
  } finally {
    await league.close();
  }
});
