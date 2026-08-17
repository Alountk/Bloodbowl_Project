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
  await page.getByRole("button", { name: "Registrarse" }).last().click();
  await expect(page).toHaveURL("/");
}

async function createTeam(page: Page, name: string) {
  await page.goto("/teams/create");
  await page.getByLabel("Nombre del equipo").fill(name);
  await page.getByLabel("Raza").selectOption("human");
  await page.getByRole("button", { name: "Siguiente →" }).click();
  const add = page.getByRole("button", { name: "Añadir Lineman" }).first();
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

/** Drives 15 end-turns (half 2 turn 8) then scores a TD by the HOME side,
 * which auto-finishes the match (D5). Every command is posted from the ACTIVE
 * side's own coach page (the route enforces the caller-side turn gate).
 * Returns the final view. */
async function autoFinishByTurnEightTd(
  homePage: Page,
  awayPage: Page,
  leagueId: string,
  fixtureId: string,
  homeScorerId: string,
): Promise<{ status: string; half: number; turnNumber: number }> {
  let view = await liveCommand(homePage, leagueId, fixtureId, { type: "endTurn", side: "home" });
  for (let i = 0; i < 14; i++) {
    const page = view.activeSide === "home" ? homePage : awayPage;
    view = await liveCommand(page, leagueId, fixtureId, {
      type: "endTurn",
      side: view.activeSide,
    });
  }
  // After 15 end-turns the state is half 2, turn 8 with HOME active.
  expect(view.half).toBe(2);
  expect(view.turnNumber).toBe(8);
  expect(view.activeSide).toBe("home");
  return liveCommand(homePage, leagueId, fixtureId, {
    type: "td",
    side: "home",
    playerRosterId: homeScorerId,
  });
}

/** Opens the resolution modal (auto-open tolerant) and runs the two steps:
 * six MJP nominations per team → server roll → save. */
async function openAndResolve(page: Page, homeTeamName: string, awayTeamName: string) {
  const dialog = page.getByRole("dialog", { name: "Resolver partido" });
  try {
    await dialog.waitFor({ state: "visible", timeout: 8_000 });
  } catch {
    await page.getByRole("button", { name: "Resolver partido" }).click();
    await expect(dialog).toBeVisible();
  }
  for (const team of [homeTeamName, awayTeamName]) {
    for (let i = 1; i <= 6; i++) {
      await dialog.getByLabel(`MVP ${i} ${team}`).selectOption({ index: i });
    }
  }
  await dialog.getByRole("button", { name: "Tirar MVP" }).click();
  await expect(dialog.getByText("Resumen de la resolución")).toBeVisible();
  await dialog.getByRole("button", { name: "Guardar y reportar" }).click();
  await expect(dialog).not.toBeVisible();
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
    await openAndResolve(admin, homeTeamName, awayTeamName);

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

    // 15 end-turns then a HOME TD on half-2 turn 8 → the match AUTO-finishes.
    const afterTd = await autoFinishByTurnEightTd(homePage, awayPage, leagueId, fixtureId, homeScorerId);
    expect(afterTd.status).toBe("finished");

    // Resolve through the modal → fixture played + round complete.
    const matchUrl = `/leagues/${leagueId}/fixtures/${fixtureId}`;
    await admin.goto(matchUrl);
    await expect(admin.getByRole("button", { name: "Resolver partido" })).toBeVisible();
    await openAndResolve(admin, homeTeamName, awayTeamName);

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
    await openAndResolve(admin, homeTeamName, awayTeamName);

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
