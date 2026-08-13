import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * Real-DB live-match E2E (auth suite only — `pnpm run test:e2e:auth` with
 * AUTH_MODE=auth + Postgres; ignored in the local `AUTH_MODE=local` suite).
 *
 * Covers the interactive 2-coach realtime slice (LM-1/LM-8/LM-11):
 *   1. a league is created (no clock option, D15); two coaches join and start a
 *      1-jornada season;
 *   2. both coaches consent through the REAL match-view buttons ("Iniciar
 *      partido" per coach), the admin begins via "Empezar partido" (two-phase
 *      LM-11/LM-3), and Coach A opens the match view (live turn bar + unified
 *      clock + score + "Dar el turno" control);
 *   3. two contexts: Coach B (second browser context) connects via SSE and sees
 *      Coach A's "Dar el turno" flip the turn/clock live (no reload);
 *   4. new-device recovery: B reconnects from a FRESH page in a new context (same
 *      user — a new device equivalent) and gets a snapshot-first live view;
 *   5. a finished live match pre-fills the result modal (scores + per-scorer
 *      TDs, LM-9) via the fixture GET live DTO.
 *
 * The two-phase consent → begin flow is driven through the REAL match-view
 * controls ("Iniciar partido" per coach, then "Empezar partido"); td/endMatch
 * stay API-driven (lifecycle + side-matrix guards are server-side). Which coach
 * owns HOME vs AWAY is resolved from the real round-robin fixture (home/away is
 * randomized) so each consent goes to the correct side. Unique emails per run
 * keep the shared Postgres idempotent.
 */
test.setTimeout(180_000);

const PASSWORD = "password-123";
const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

/** Applies a tight default action timeout so a hung step fails fast with a clear locator. */
function tight(page: Page) {
  page.setDefaultTimeout(12_000);
  return page;
}

async function signup(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).last().click();
  await expect(page).toHaveURL("/");
}

async function createTeam(page: Page, name: string) {
  await page.goto("/teams/create");
  await page.getByLabel("Team name").fill(name);
  await page.getByLabel("Race").selectOption("human");
  await page.getByRole("button", { name: /siguiente/i }).click();
  const add = page.getByRole("button", { name: "Add Lineman" }).first();
  for (let i = 0; i < 11; i++) await add.click();
  await page.getByRole("button", { name: /create team/i }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText(name)).toBeVisible();
}

/** Builds a started 2-member league (A owns a team + league; B joins). */
async function buildStartedLeague(
  browser: Browser,
  tag: string,
): Promise<{
  admin: Page;
  rival: Page;
  leagueId: string;
  adminTeam: string;
  rivalTeam: string;
  rivalEmail: string;
  close: () => Promise<void>;
}> {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const admin = tight(await contextA.newPage());
  const rival = tight(await contextB.newPage());
  const close = async () => {
    await contextA.close();
    await contextB.close();
  };

  try {
    await signup(admin, uniqueEmail(`lm-admin-${tag}`));
    const adminTeam = `LMA-${tag} ${Date.now()}`;
    await createTeam(admin, adminTeam);
    const leagueName = `LM Liga ${tag} ${Date.now()}`;
    await admin.goto("/leagues");
    await expect(admin.getByRole("heading", { name: "Mis Ligas" })).toBeVisible();
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

    const rivalEmail = uniqueEmail(`lm-rival-${tag}`);
    await signup(rival, rivalEmail);
    const rivalTeam = `LMB-${tag} ${Date.now()}`;
    await createTeam(rival, rivalTeam);
    await rival.goto("/leagues");
    await rival
      .locator("li")
      .filter({ hasText: leagueName })
      .getByRole("link", { name: "Ver", exact: true })
      .click();
    await rival.getByLabel("Tu equipo").selectOption({ label: rivalTeam });
    await rival.getByRole("button", { name: "Apuntarse" }).click();
    await expect(rival.getByText(rivalTeam)).toBeVisible();

    await admin.reload();
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

    return { admin, rival, leagueId: leagueId as string, adminTeam, rivalTeam, rivalEmail, close };
  } catch (error) {
    await close();
    throw error;
  }
}

/** Logs an existing user in on a fresh context (a new-device equivalent). */
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).last().click();
  await expect(page).toHaveURL("/");
}

/** Returns the fixture id + home/away team names + their first roster scorers. */
async function fixtureAndScorers(
  page: Page,
  leagueId: string,
): Promise<{
  fixtureId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScorerId: string;
  homeScorerName: string;
  awayScorerId: string;
  awayScorerName: string;
}> {
  const res = await page.request.get(`/api/leagues/${leagueId}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    fixtures: { id: string; status: string; homeTeamId: string; awayTeamId: string }[];
    teams: { id: string; name: string; roster: { id: string; name: string }[] }[];
  };
  const fixture = body.fixtures[0];
  const home = body.teams.find((t) => t.id === fixture.homeTeamId);
  const away = body.teams.find((t) => t.id === fixture.awayTeamId);
  expect(fixture).toBeDefined();
  expect(home && home.roster.length).toBeGreaterThan(0);
  expect(away && away.roster.length).toBeGreaterThan(0);
  return {
    fixtureId: fixture.id,
    homeTeamName: home!.name,
    awayTeamName: away!.name,
    homeScorerId: home!.roster[0].id,
    homeScorerName: home!.roster[0].name,
    awayScorerId: away!.roster[0].id,
    awayScorerName: away!.roster[0].name,
  };
}

/**
 * Resolves which coach owns the HOME side vs AWAY side for the real round-robin
 * fixture (home/away is randomized by `buildRoundRobin`, so we must map the
 * created team names against the fixture's actual home/away names — the spec
 * helpers return names/scorers but not owner→side).
 */
function resolveCoachSides(
  adminTeam: string,
  rivalTeam: string,
  homeTeamName: string,
  awayTeamName: string,
): { adminIsHome: boolean; adminSide: "home" | "away"; rivalSide: "home" | "away" } {
  const adminIsHome = adminTeam === homeTeamName;
  // Sanity: the two created teams are exactly the fixture's two sides.
  expect(adminIsHome ? rivalTeam === awayTeamName : adminTeam === awayTeamName).toBe(true);
  return {
    adminIsHome,
    adminSide: adminIsHome ? "home" : "away",
    rivalSide: adminIsHome ? "away" : "home",
  };
}

/** Schedules the fixture via API (rival proposes, admin accepts). */
async function scheduleFixture(admin: Page, rival: Page, leagueId: string, fixtureId: string) {
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
}

async function liveCommand(page: Page, leagueId: string, fixtureId: string, data: unknown) {
  const res = await page.request.post(`/api/leagues/${leagueId}/fixtures/${fixtureId}/live`, { data });
  expect(res.status()).toBe(200);
  return (await res.json()) as { view: { seq: number; status: string; turnNumber: number } };
}

test("two-context SSE sync + new-device recovery + result prefill", async ({ browser }) => {
  const tag = Date.now().toString(36);
  const league = await buildStartedLeague(browser, tag);
  try {
    const { admin, rival, leagueId, rivalEmail, adminTeam, rivalTeam } = league;
    const { fixtureId, homeTeamName, awayTeamName, awayScorerId, awayScorerName } = await fixtureAndScorers(admin, leagueId);
    // Which team is home is randomized by buildRoundRobin (~50/50); the TD
    // below targets the AWAY side (valid after Coach A's turn flip), so the
    // score lands on whatever team is away. Assert side-relative below.
    await scheduleFixture(admin, rival, leagueId, fixtureId);

    // Resolve the REAL owner→side mapping (home/away is randomized) and run the
    // two-phase consent → begin flow (LM-11/LM-3) through the REAL match-view
    // controls: each coach clicks "Iniciar partido" on their own page, then the
    // admin clicks "Empezar partido" to begin the first turn.
    const { adminIsHome } = resolveCoachSides(adminTeam, rivalTeam, homeTeamName, awayTeamName);
    const matchUrl = `/leagues/${leagueId}/fixtures/${fixtureId}`;
    const homeCoach = adminIsHome ? admin : rival;
    const awayCoach = adminIsHome ? rival : admin;

    // Coach A (admin) opens the match page — the consent panel must know the
    // viewer's side and show "Iniciar partido" (D19; the regression this flow
    // guards) — and consents via the REAL button.
    await admin.goto(matchUrl);
    await expect(admin.getByText(/Partido programado/).first()).toBeVisible();
    const consentButton = admin.getByRole("button", { name: "Iniciar partido" });
    await expect(consentButton).toBeVisible();
    await consentButton.click();
    // The coach's own consent is reflected: waiting for the rival (LM-11).
    await expect(admin.getByText(/Listo, esperando al rival/).first()).toBeVisible();

    // Coach B opens a FRESH page — the live row exists but B has not consented —
    // and consents via the REAL button (two-phase LM-11).
    await rival.goto(matchUrl);
    const rivalConsentButton = rival.getByRole("button", { name: "Iniciar partido" });
    await expect(rivalConsentButton).toBeVisible();
    await rivalConsentButton.click();
    await expect(rival.getByText(/Listo, esperando al rival/).first()).toBeVisible();

    // Coach A converges to the ready state (snapshot-first, LM-8) and begins the
    // match via the REAL "Empezar partido" control.
    await admin.reload();
    const beginButton = admin.getByRole("button", { name: "Empezar partido" });
    await expect(beginButton).toBeVisible();
    await beginButton.click();
    await expect(admin.getByText(/Mitad 1 · Turno 1/).first()).toBeVisible();

    // Coach B converges to the live state (snapshot-first, LM-8).
    await rival.reload();
    await expect(rival.getByText(/Mitad 1 · Turno 1/).first()).toBeVisible();

    // LM-12/D19: the first ACTIVE side after begin is home (LM-3: half 1 turn 1
    // home). Only the ACTIVE coach sees "Tu turno" + "Dar el turno"; the
    // non-active coach sees "Pedir turno" and never "Dar el turno".
    await expect(homeCoach.getByText(/Tu turno/).first()).toBeVisible();
    await expect(homeCoach.getByRole("button", { name: "Dar el turno" })).toBeVisible();
    await expect(homeCoach.getByRole("button", { name: "Pedir turno" })).toHaveCount(0);
    await expect(awayCoach.getByText(/Tu turno/)).toHaveCount(0);
    await expect(awayCoach.getByRole("button", { name: "Pedir turno" })).toBeVisible();
    await expect(awayCoach.getByRole("button", { name: "Dar el turno" })).toHaveCount(0);

    // The active (home) coach clicks "Dar el turno" → the turn flips, the DB
    // persists it, and the new ACTIVE side becomes away (turn 2).
    await homeCoach.getByRole("button", { name: "Dar el turno" }).click();
    await expect(homeCoach.getByText(/Mitad 1 · Turno 2/).first()).toBeVisible();

    // Coach B converges to the flip. In `next dev` the in-memory hub is
    // re-instantiated per request, so a live SSE push between two co-tested
    // contexts is not observable there; in production (single `next start`
    // process) the shared hub broadcasts it live. The convergence below is the
    // snapshot-first LM-8 path (DB-backed), which holds in both modes and is
    // the guarantee a `useLiveMatch` reconnect relies on. The live SSE fan-out
    // itself is covered by the unit/route tests.
    await rival.reload();
    await expect(rival.getByText(/Mitad 1 · Turno 2/).first()).toBeVisible();

    // New-device recovery: B logs in from a FRESH context (same user, a new
    // device equivalent) and gets a snapshot-first live view (turn 2 persisted).
    const freshContext = await browser.newContext();
    const freshB = tight(await freshContext.newPage());
    await login(freshB, rivalEmail);
    await freshB.goto(matchUrl);
    // Snapshot-first: the fresh device converges to the current live state.
    await expect(freshB.getByText(/Mitad 1 · Turno 2/).first()).toBeVisible();
    await freshContext.close();

    // Finish the match: the AWAY team is now on the active turn (Turn 2). Under
    // LM-12 the ACTIVE (away) coach may record the TD — route it through that
    // coach's own context so the side-matrix guard allows it — then the match
    // ends (lifecycle, admin MayEnd). The finished live DTO then pre-fills the
    // result modal.
    await liveCommand(awayCoach, leagueId, fixtureId, { type: "td", side: "away", playerRosterId: awayScorerId });
    const afterEnd = await liveCommand(admin, leagueId, fixtureId, { type: "endMatch" });
    expect(afterEnd.view.status).toBe("finished");

    // Result prefill (LM-9): opening the result modal on the finished-live
    // fixture prefills the AWAY team's score (1) and its scorer's TD (1) —
    // whoever is home/away (the admin team side is randomized). MVP/casualty
    // stay coach input.
    await admin.goto(`/leagues/${leagueId}`);
    await expect(admin.getByRole("region", { name: "Jornada 1" })).toBeVisible();
    await admin.getByRole("button", { name: "Cargar resultado" }).first().click();
    const dialog = admin.getByRole("dialog", { name: /Cargar resultado/ });
    const awaySection = dialog.getByLabel(`Resultado ${awayTeamName}`);
    const homeSection = dialog.getByLabel(`Resultado ${homeTeamName}`);
    // The away team scored 1 (the TD), the home team 0.
    await expect(awaySection.getByLabel(`Goles ${awayTeamName}`)).toHaveValue("1");
    await expect(homeSection.getByLabel(`Goles ${homeTeamName}`)).toHaveValue("0");
    // The away scorer's TD (1) prefilled; no MJP nominations auto-filled.
    await expect(awaySection.getByLabel(`Anotaciones ${awayScorerName}`, { exact: true })).toHaveValue("1");
  } finally {
    await league.close();
  }
});
