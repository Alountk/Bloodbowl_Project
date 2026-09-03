import { test, expect, type Browser, type Page } from "@playwright/test";
test.use({ locale: "es-ES" });

/**
 * Real-DB live-match E2E (auth suite only — `pnpm run test:e2e:auth` with
 * AUTH_MODE=auth + Postgres; ignored in the local `AUTH_MODE=local` suite).
 *
 * Covers the interactive 2-coach realtime slice (LM-1/LM-8/LM-11) PLUS the
 * Design-A history feed and the Design-A contextual action DOCK (LM-17/LM-46):
 *   1. a league is created (no clock option, D15); two coaches join and start a
 *      1-jornada season;
 *   2. both coaches consent through the REAL match-view buttons ("Iniciar
 *      partido" per coach), the admin begins via "Empezar partido" (two-phase
 *      LM-11/LM-3), and the live turn bar + unified clock + score render;
 *   3. the take-and-give flow is LIVE via SSE: Coach B sees Coach A's
 *      "Dar el turno" flip the turn WITHOUT any reload, and the ACTIVE coach
 *      sees the "Tu rival pide el turno" banner when the other coach clicks
 *      "Pedir turno" — the process-wide shared hub + the drained SSE gap queue
 *      make cross-context fan-out observable in `next dev`;
 *   4. new-device recovery: B reconnects from a FRESH page in a new context (same
 *      user — a new device equivalent) and gets a snapshot-first live view;
 *   5. Event recording via the REAL contextual action dock (LM-46/D26): a fixed
 *      bar over the viewport shows the actions legal RIGHT NOW per role and
 *      opens a player-chip SHEET (dorsal + short name; alive, non-suspended
 *      only). Two-touch TD/Pase (action → own player chip fires instantly) and
 *      the guided casualty / foul steppers reuse 1D16(+1D6) `RollStepper`
 *      (no FAB, no menu, no long selects). The NON-active coach's dock offers
 *      ONLY "Baja propia" (dodge/crowd) and "Baja — ambos derribados" (LM-12).
 *      The ACTIVE coach records a Pase completo (★1), a Touchdown (★3) and
 *      drives the DIRECT blitz casualty; the canonical both-down pair is
 *      recorded through the dock: record A by the away ACTIVE (plain `block`,
 *      victim = a home defender, causer = an away blocker) and record B by the
 *      home NON-active (`bothDown:true`, victim = an away blocker, causer = a
 *      home defender) — DEC-1: BOTH records award ★2 on their causer action
 *      cards (no PE exception), the pair renders as four separate rows (feed
 *      rows appear live via the hub);
 *   6. reload persistence: the match page re-renders the same Design-A history
 *      from the persisted events (no turn rows, a reload does not drop them);
  *   7. a finished live match shows the RAU-49/RAU-52 guided RESOLUTION flow —
  *      the persistent "Informar del fin del partido" card (resume-at-step) +
  *      the PER-SIDE 5-step WIZARD (ganancias → fans → MVP → reveal+bajas →
  *      novatos; each coach advances their own side; the reveal waits for both;
  *      the LAST completion closes the match) — and, once resolved, the
  *      finished feed carries the home+away mvp rows (★4), the snapshot summary
  *      rows, the fixture is PLAYED with the recorded score and the single
  *      jornada completes (the close command IS the closure, replacing the old
  *      result-modal prefill flow).
 *
 * rulebook redesign guards (MVT-1/2/3/4) are asserted against the REAL UI:
 * the sticky header back arrow + horizontal timeline bar (MVT-2/MVT-3), the
 * per-TD partial score on TD cards (MVT-1), and the snapshot summary rows
 * above the finished feed's event cards (MVT-4).
 *
 * The two-phase consent → begin flow is driven through the REAL match-view
 * controls ("Iniciar partido" per coach, then "Empezar partido") and converges
 * via SSE too — reloads are kept only where they test genuine snapshot/recovery
 * semantics (the fresh-context step and the reload persistence step); the
 * fan-out itself is asserted live. endMatch stays API-driven (lifecycle + side-
 * matrix guards are server-side). Which coach owns HOME vs AWAY is resolved from
 * the real round-robin fixture (home/away is randomized) so each consent goes to
 * the correct side. Unique emails per run keep the shared Postgres idempotent.
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
  const contextA = await browser.newContext({ locale: "es-ES" });
  const contextB = await browser.newContext({ locale: "es-ES" });
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
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).last().click();
  await expect(page).toHaveURL("/");
}

/** Returns the fixture id + team names + the served home/away rosters (dorsal
 * order) so the recording flows can tap/assert distinct players by name. */
async function loadFixtureContext(
  page: Page,
  leagueId: string,
): Promise<{
  fixtureId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScorerName: string;
  /** The FULL served home/away rosters in dorsal order (index + 1) — the slice
   * drives the both-down pair on distinct players and names the cards. */
  homeRoster: { id: string; name: string }[];
  awayRoster: { id: string; name: string }[];
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
    homeScorerName: home!.roster[0].name,
    homeRoster: home!.roster,
    awayRoster: away!.roster,
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

/** Opens the resolution modal (auto-open tolerant) on a coach's OWN page. */
async function openResolution(page: Page, matchUrl: string) {
  await page.goto(matchUrl);
  const dialog = page.getByRole("dialog", { name: "Resolver partido" });
  try {
    await dialog.waitFor({ state: "visible", timeout: 8_000 });
  } catch {
    await page.getByRole("button", { name: "Reanudar" }).click();
    await expect(dialog).toBeVisible();
  }
  return dialog;
}

/**
 * RAU-52 rework: drives a coach's OWN side through steps 1–3 (winnings →
 * fans → MVP) independently of the rival — the server-owned 1D6 fan roll, the
 * six checkbox nominations + the SEND + the FINAL confirm (irrevocable).
 * Returns the dialog (now at the "mvp-done" waiting step).
 */
async function driveWinningsFansMvp(page: Page, matchUrl: string) {
  const dialog = await openResolution(page, matchUrl);
  await expect(dialog.getByText("Paso: Ganancias y mantenimiento")).toBeVisible({ timeout: 25_000 });
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.getByText("Paso: Tirada de fans")).toBeVisible({ timeout: 25_000 });
  await dialog.getByRole("button", { name: "Tirar 1D6" }).click();
  await expect(dialog.getByText(/factor fan/)).toBeVisible();
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.getByText("Paso: Nominaciones al MVP")).toBeVisible({ timeout: 25_000 });
  await expect(dialog.getByRole("checkbox").first()).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await dialog.getByRole("checkbox").nth(i).check();
  }
  await dialog.getByRole("button", { name: "Guardar mis nominaciones" }).click();
  await expect(dialog.getByText("Nominaciones enviadas")).toBeVisible();
  await dialog.getByRole("button", { name: "Confirmar" }).click();
  await expect(dialog.getByText("¿Estás seguro?")).toBeVisible({ timeout: 25_000 });
  await dialog.getByRole("button", { name: "Sí, confirmar" }).click();
  await expect(
      dialog.getByText(/Paso: (MVP confirmado|MVP y bajas)/),
    ).toBeVisible({ timeout: 30_000 });
  return dialog;
}

/** Advances a coach's own side past step 4 (the MVP REVEAL + the visible
 * casualties). The reveal fires automatically once BOTH sides confirmed. */
async function driveRevealAndCasualties(page: Page, dialog: ReturnType<Page["getByRole"]>) {
  await expect(dialog.getByText("Paso: MVP y bajas")).toBeVisible({ timeout: 35_000 });
  await dialog.getByRole("button", { name: "Continuar" }).click();
}

/** Finishes step 5 (journeymen) — the ≥11-healthy sides here have nothing to
 * decide → completes the side ("Continuar"). */
async function driveJourneymenDone(dialog: ReturnType<Page["getByRole"]>) {
  await expect(dialog.getByText("Paso: Novatos")).toBeVisible({ timeout: 20_000 });
  const hire = dialog.getByTestId("journeymen-hire");
  if ((await hire.count()) > 0) {
    while ((await hire.getByRole("button", { name: "Dejar ir" }).count()) > 0) {
      const remaining = await hire.getByRole("button", { name: "Dejar ir" }).count();
      const letGo = hire.getByRole("button", { name: "Dejar ir" }).first();
      await expect(letGo).toBeEnabled({ timeout: 15_000 });
      await letGo.dispatchEvent("click");
      if (remaining > 1) {
        await expect(dialog.getByRole("button", { name: "Continuar" })).toBeDisabled();
      }
    }
  }
  await dialog.getByRole("button", { name: "Continuar" }).click();
}

/**
 * The REAL action dock for a coach's page (Design A): a fixed contextual bar
 * that shows the actions legal RIGHT NOW by role, which opens a chip sheet.
 */
function actionDock(coach: Page) {
  return coach.getByTestId("live-action-dock");
}

/** Opens the dock sheet for the coach's given action (matched by name). */
async function openDockAction(coach: Page, actionName: string): Promise<ReturnType<Page["getByTestId"]>> {
  const dock = actionDock(coach);
  await expect(dock).toBeVisible();
  await dock.getByRole("button", { name: new RegExp(actionName, "i") }).click();
  const sheet = dock.getByTestId("live-action-sheet");
  await expect(sheet).toBeVisible();
  return dock;
}

/** Taps the coach's Nth OWN dorsal chip currently offered by the sheet pool. */
async function dockTapOwn(coach: Page, ownIndex: number) {
  const dock = actionDock(coach);
  const pool = dock.getByTestId("dock-pool-own");
  await expect(pool).toBeVisible();
  const chip = pool.getByTestId("dock-player-own").nth(ownIndex);
  await expect(chip).toBeVisible();
  await chip.click();
}

/** Taps the RIVAL team's Nth dorsal chip currently offered by the sheet pool. */
async function dockTapRival(coach: Page, rivalIndex: number) {
  const dock = actionDock(coach);
  const pool = dock.getByTestId("dock-pool-rival");
  await expect(pool).toBeVisible();
  const chip = pool.getByTestId("dock-player-rival").nth(rivalIndex);
  await expect(chip).toBeVisible();
  await chip.click();
}

/**
 * Two-touch TD / Pase from the dock: action → the coach's OWN player chip,
 * which fires the command instantly and closes the sheet (no roll stages).
 */
async function dockScoredAction(coach: Page, actionName: string, ownIndex: number) {
  await openDockAction(coach, actionName);
  await dockTapOwn(coach, ownIndex);
  const dock = actionDock(coach);
  await expect(dock.getByTestId("live-action-sheet")).toHaveCount(0);
}

/** Picks the active coach's injury CAUSE from the step's cause chips. */
async function dockPickCause(coach: Page, causeLabel: string) {
  const dock = actionDock(coach);
  const causes = dock.getByTestId("dock-cause-pool");
  await expect(causes).toBeVisible();
  await causes.getByRole("button", { name: new RegExp(causeLabel, "i") }).click();
}

/** Rolls the 1D16 (+1D6 when permanent) inside the dock sheet + Registers. */
async function dockRollAndRecord(coach: Page, roll16: number, roll6?: number) {
  const dock = actionDock(coach);
  const stepper = dock.getByTestId("dock-roll-stage");
  await expect(stepper).toBeVisible();
  await stepper.getByTestId(`roll-option-${roll16}`).click();
  if (roll6 != null) {
    const six = dock.getByTestId("roll-stepper-6");
    await expect(six).toBeVisible();
    await six.getByTestId(`roll-option-${roll6}`).click();
  }
  await dock.getByTestId("live-action-submit").click();
  await expect(actionDock(coach).getByTestId("live-action-sheet")).toHaveCount(0);
}


test("two-context SSE sync + new-device recovery + result prefill", async ({ browser }) => {
  const tag = Date.now().toString(36);
  const league = await buildStartedLeague(browser, tag);
  try {
    const { admin, rival, leagueId, rivalEmail, adminTeam, rivalTeam } = league;
    const { fixtureId, homeTeamName, awayTeamName, homeScorerName, homeRoster, awayRoster } = await loadFixtureContext(admin, leagueId);
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
    // B's consent is the SECOND one, so the match becomes ready immediately and
    // B's own POST response already shows "Listo para empezar" + "Empezar partido".
    await expect(rival.getByText(/Listo para empezar/).first()).toBeVisible();
    await expect(rival.getByRole("button", { name: "Empezar partido" })).toBeVisible();

    // Coach A converges to the ready state via SSE (no reload — the shared hub
    // fans the rival's second consent out live) and begins the match via the
    // REAL "Empezar partido" control.
    const beginButton = admin.getByRole("button", { name: "Empezar partido" });
    await expect(beginButton).toBeVisible();
    await beginButton.click();
    await expect(admin.getByText(/Mitad 1 · Turno 1/).first()).toBeVisible();

    // Coach B converges to the live state via SSE (no reload).
    await expect(rival.getByText(/Mitad 1 · Turno 1/).first()).toBeVisible();

    // MVT-6 / LM-21 / LM-22 / RAU-33: the kickoff events are spliced BEFORE
    // start and render at minute 0'. Both e2e teams start at treasury 0, BELOW
    // the 100k rulebook minimum, so RAU-33 skips the expensive-mistake roll
    // entirely — NO "Error costoso" card, no row, no treasury deduction — and
    // only the centered fan_factor row ("Factor de aficionados") renders. The
    // `live-event-row` testid is preserved on every card (MVT-1 continuity).
    const liveRows = admin.getByTestId("live-event-row");
    await expect(liveRows.filter({ hasText: "Error costoso" })).toHaveCount(0);
    await expect(liveRows.filter({ hasText: "Factor de aficionados" })).toHaveCount(1);
    // MVT-6 "kickoff rows at minute zero": the home turnStart card (RAU-36/37)
    // shares the begin instant with `startedAt`, so deriveMinute clamps it to
    // 0'. The v7 fan_factor center card carries no right minute, so the zero-
    // minute check lands on the turnStart card instead.
    await expect(
      liveRows.filter({ hasText: `Turno ${homeTeamName}` }).first(),
    ).toContainText("0'");

    // LM-21 "begin retry is idempotent": a second begin after an already-live
    // match returns 409 via the route's 409 catch (beginLiveMatch maps
    // "begin only from ready" → 409), the seq/treasury guard keeps it from
    // re-persisting kickoff rows, and the treasury is NOT deducted twice. The
    // kickoff row counts stay EXACTLY 0 + 1 — no duplicate rows.
    const retryBegin = await admin.request.post(
      `/api/leagues/${leagueId}/fixtures/${fixtureId}/live`,
      { data: { type: "begin" } },
    );
    expect(retryBegin.status()).toBe(409);
    await expect(liveRows.filter({ hasText: "Error costoso" })).toHaveCount(0);
    await expect(liveRows.filter({ hasText: "Factor de aficionados" })).toHaveCount(1);

    // MVT-2/MVT-3: the sticky rulebook header renders the back arrow to the
    // jornada and the horizontal timeline bar once the match is live. The bar
    // derives from the LM-16 display events only, so a reload reproduces it.
    const header = admin.getByTestId("rulebook-header");
    await expect(header).toBeVisible();
    await expect(
      header.getByRole("link", { name: "Volver a la jornada" }),
    ).toHaveAttribute("href", `/leagues/${leagueId}`);
    await expect(header.getByTestId("match-timeline")).toBeVisible();
    // MVT-3: the sticky header NEVER hosts the pass-turn action — it lives in the
    // bottom dock (MVT-7). Lock that the header has no "Dar el turno" nor the
    // "Turno {team}" status small.
    await expect(header.getByRole("button", { name: "Dar el turno" })).toHaveCount(0);
    await expect(header.getByRole("status")).toHaveCount(0);

    // LM-12/D19/MVT-7: the first ACTIVE side after begin is home (LM-3: half 1
    // turn 1 home). The pass-turn control lives ONLY in the bottom dock: its red
    // "Dar el turno" chip carries the "Turno {team}" role=status; the NON-active
    // coach sees "Pedir turno" and never "Dar el turno". The header NEVER hosts
    // the pass control (MVT-3), so the role=status small is the dock chip's.
    // The timeline turn-start card ALSO reads "Turno {homeTeamName}" (RAU-36/37),
    // so the status checks target the role=status small specifically.
    await expect(homeCoach.getByRole("status")).toHaveText(`Turno ${homeTeamName}`);
    await expect(homeCoach.getByRole("button", { name: "Dar el turno" })).toBeVisible();
    await expect(homeCoach.getByRole("button", { name: "Pedir turno" })).toHaveCount(0);
    await expect(awayCoach.getByRole("status")).toHaveCount(0);
    await expect(awayCoach.getByRole("button", { name: "Pedir turno" })).toBeVisible();
    await expect(awayCoach.getByRole("button", { name: "Dar el turno" })).toHaveCount(0);

    // The ACTIVE (home) coach opens the dock chip's reason sheet, then
    // DOUBLE-CLICKS its Confirmar → the in-flight lock drops the second
    // invocation (Confirmar defaults to voluntary, MVT-7), so the turn flips by
    // EXACTLY ONE. A raw pointer dblclick lands the second click while the first
    // endTurn is still in flight (no actionability waits) — the pre-lock bug sent
    // a second endTurn and jumped the turn by two. The hub then fans the new
    // state out over SSE: the OTHER coach's page converges WITHOUT any reload —
    // the live `event` frame (turn + turnStart deltas) applies the flipped state.
    const passChip = homeCoach.getByRole("button", { name: "Dar el turno" });
    await expect(passChip).toBeVisible();
    await passChip.click();
    const sheet = homeCoach.getByTestId("live-action-sheet");
    await expect(sheet).toBeVisible();
    // Three reason chips render; Voluntario is preselected → confirming needs no
    // further choice (the default voluntary path == today's plain pass).
    await expect(sheet.getByRole("button", { name: "Voluntario" })).toHaveAttribute("aria-pressed", "true");
    const confirmBtn = sheet.getByRole("button", { name: "Confirmar" });
    const box = (await confirmBtn.boundingBox())!;
    await homeCoach.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    // Correct BB2025 turn semantics (recurring regression): the turn number
    // names the ROUND shared by both sides — home T1 → away T1 → home T2. The
    // away side takes their TURN 1, so the header reads "Mitad 1 · Turno 1"
    // (NOT 2) on both coaches' pages.
    await expect(homeCoach.getByText(/Mitad 1 · Turno 1/).first()).toBeVisible();
    await expect(awayCoach.getByText(/Mitad 1 · Turno 1/).first()).toBeVisible();
    // Regression: exactly one flip — turn 2 never appears, the away coach is
    // the one now active ("Turno {awayTeamName}"), and the home coach's status
    // is gone.
    await expect(awayCoach.getByRole("status")).toHaveText(`Turno ${awayTeamName}`);
    await expect(homeCoach.getByText(/Mitad 1 · Turno 2/)).toHaveCount(0);
    await expect(homeCoach.getByRole("status")).toHaveCount(0);

    // LM-13: the now-NON-active coach (home) clicks "Pedir turno" → the
    // requestTurn delta event streams to the ACTIVE (away) coach's page and the
    // "Tu rival pide el turno" banner appears live — no reload. The requester's
    // own page never shows it (it stays non-active).
    await expect(homeCoach.getByRole("button", { name: "Pedir turno" })).toBeVisible();
    await homeCoach.getByRole("button", { name: "Pedir turno" }).click();
    await expect(awayCoach.getByText("Tu rival pide el turno")).toBeVisible();
    await expect(homeCoach.getByText("Tu rival pide el turno")).toHaveCount(0);

    // DESIGN-A feed (LM-17) + contextual action dock (LM-46/D26) — recorded
    // through the REAL dock (no FAB, no player-first strip, no selects). At this
    // point the AWAY coach is ACTIVE and the HOME coach is NON-active, so each
    // role's dock is exercised deterministically (each coach's OWN alive players
    // are dorsal-served; both all alive so a served index == the chip index).
    //
    // [A1] NON-active (home) coach: their dock offers ONLY the casualty
    // records — "Baja propia" (self-inflicted dodge/crowd wound on their own
    // player) and "Baja — ambos derribados" — with NO TD / Pase / Falta
    // (LM-20 scenario). RAU-39: the record carries NO causer; the 1D16 roll
    // band is derived server-side (NEVER a band select).
    const homeDock = actionDock(homeCoach);
    await expect(homeDock).toBeVisible();
    await expect(homeDock.getByRole("button", { name: "Baja propia" })).toBeVisible();
    await expect(homeDock.getByRole("button", { name: "Baja — ambos derribados" })).toBeVisible();
    await expect(homeDock.getByRole("button", { name: /Touchdown/i })).toHaveCount(0);
    await expect(homeDock.getByRole("button", { name: /Pase completo/i })).toHaveCount(0);
    await expect(homeDock.getByRole("button", { name: /Falta/i })).toHaveCount(0);
    await openDockAction(homeCoach, "Baja propia");
    // The own fallen player is picked as the VICTIM of their own dodge.
    await dockTapOwn(homeCoach, 0);
    // Only self-inflicted causes are offered (dodge/crowd) — never blitz/foul.
    const causePool = await actionDock(homeCoach).getByTestId("dock-cause-pool");
    await expect(causePool.getByRole("button", { name: "Bloqueo" })).toHaveCount(0);
    await expect(causePool.getByRole("button", { name: "Blitz" })).toHaveCount(0);
    await expect(causePool.getByRole("button", { name: /Falta/i })).toHaveCount(0);
    await causePool.getByRole("button", { name: "Esquivando — se cayó" }).click();
    // Self-inflicted: no rival pool stage; jump to the RollStepper.
    await expect(actionDock(homeCoach).getByTestId("dock-pool-rival")).toHaveCount(0);
    await dockRollAndRecord(homeCoach, 9);
    // The self-inflicted casualty card (victim = own home #1) renders with the
    // derived band + roll line and NO "por …" causer line (no causer pays no-★).
    await expect(
      homeCoach.getByTestId("live-event-row").filter({ hasText: homeRoster[0].name }).filter({ hasText: "Tirada 1D16: 9" }),
    ).toBeVisible();
    await expect(
      homeCoach.getByTestId("live-event-row").filter({ hasText: homeRoster[0].name }).filter({ hasText: "por " }),
    ).toHaveCount(0);

    // [A2] DIRECT casualty (design B, RAU-82): the ACTIVE (away) coach records
    // the DIRECT blitz injury THEY inflicted through the dock — "Baja causada"
    // → cause Blitz → the away #1 as CAUSER → home #1 as VICTIM → 1D16 roll.
    // One phase, consumed instantly; the rival (home) sees the card with the
    // ✓/✗ ack row — informational only, the match never waits). The band is
    // derived server-side from the roll (never a band select).
    const awayDock = actionDock(awayCoach);
    await expect(awayDock).toBeVisible();
    await expect(awayDock.getByRole("button", { name: "Baja propia" })).toHaveCount(0);
    await expect(awayDock.getByRole("button", { name: "Baja causada" })).toBeVisible();
    await openDockAction(awayCoach, "Baja causada");
    await dockPickCause(awayCoach, "Blitz");
    // Own causer (away #1) then rival victim (home #1) — action wins.
    await dockTapOwn(awayCoach, 0);
    await dockTapRival(awayCoach, 0);
    await dockRollAndRecord(awayCoach, 9);
    // The DIRECT casualty card appears INSTANTLY for the recorder: the injury
    // card on the victim's (home) side with the MVT-5 causer line AND the derived
    // action card on the causer's (away) side — both feeds converge via the hub.
    // The self-inflicted [A1] leaf has the SAME victim name but NO "por …" line,
    // so the caused injury card is matched by victim + causer line.
    await expect(
      awayCoach.getByTestId("live-event-row").filter({ hasText: homeRoster[0].name }).filter({ hasText: "· Blitz" }),
    ).toBeVisible();
    await expect(
      homeCoach
        .getByTestId("live-event-row")
        .filter({ hasText: homeRoster[0].name })
        .filter({ hasText: `por ${awayRoster[0].name}` }),
    ).toBeVisible();
    await expect(
      homeCoach.getByTestId("live-event-row").filter({ hasText: `por ${awayRoster[0].name}` }),
    ).toBeVisible();
    await expect(
      awayCoach.getByTestId("live-event-row").filter({ hasText: "· Blitz" }),
    ).toBeVisible();
    // LM-26 payload-aware ✓/✗: the RIVAL (home — the fallen player's coach) sees
    // the ack row + ✓/✗ buttons on the DIRECT injury card; the recorder (away)
    // never sees its own ack control. The game never waits — card already consumed.
    await expect(
      homeCoach.getByTestId("live-event-row").filter({ hasText: `por ${awayRoster[0].name}` }).getByRole("button", { name: /Correcto/i }),
    ).toBeVisible();
    await expect(
      awayCoach.getByTestId("live-event-row").filter({ hasText: "· Blitz" }).getByRole("button", { name: /Correcto/i }),
    ).toHaveCount(0);
    await homeCoach
      .getByTestId("live-event-row")
      .filter({ hasText: `por ${awayRoster[0].name}` })
      .getByRole("button", { name: /Correcto/i })
      .click();
    // The ✓ persists and shows "Cotejado" on both feeds (the ack frame upserts
    // the card by seq via the hub).
    await expect(
      homeCoach.getByTestId("live-event-row").filter({ hasText: `por ${awayRoster[0].name}` }).getByText(/Cotejado/),
    ).toBeVisible();
    await expect(
      awayCoach.getByTestId("live-event-row").filter({ hasText: "· Blitz" }).getByText(/Cotejado/),
    ).toBeVisible();

    // RECURRING REGRESSION (RAU-47): ★2 the CAUSER earns shows ONLY on the
    // causer's action card — the VICTIM's injury card with "por {causer}" MUST
    // NOT show the earned points (roll 9 → apaleado → lasting ★2, never hidden).
    const blitzActionLine = `${awayRoster[0].name} hace una herida a ${homeRoster[0].name}`;
    for (const page of [awayCoach, homeCoach]) {
      await expect(
        page.getByTestId("live-event-row").filter({ hasText: blitzActionLine }).filter({ hasText: "(★2)" }),
      ).toBeVisible();
      // The victim's injury card (with the causer line) carries NO star.
      await expect(
        page.getByTestId("live-event-row").filter({ hasText: `por ${awayRoster[0].name}` }).filter({ hasText: "(★2)" }),
      ).toHaveCount(0);
    }

    // [B] BOTH-DOWN CANONICAL PAIR (LM-12/D1, DEC-1 ★2-symmetric). Both records
    // happen inside the away-active turn as CASUALTIES (they never flip the
    // turn): record A by the away ACTIVE over the dock (plain `block` casualty:
    // victim = a home defender, causer = an away blocker), then record B by the
    // home NON-active ("Baja — ambos derribados": victim = an away blocker,
    // causer = the home defender, `bothDown: true`). DEC-1: BOTH causer
    // records award ★2 on their derived action cards (no PE suppression) and the
    // pair renders as FOUR separate rows — the blocker record's injury card alone
    // carries the "(Ambos derribados)" marker copy.
    const awayBlocker = awayRoster[2]; // record-A causer (away #3)
    const homeDefenderDown = homeRoster[1]; // record-A victim (home #2)
    const homeDefenderCauser = homeRoster[3]; // record-B causer (home #4)
    const awayBlockerDown = awayRoster[4]; // record-B victim (away #5)

    // Record A: away ACTIVE "Baja causada" → cause Bloqueo → away #3 CAUSER →
    // then home #2 VICTIM (dock order: cause → causer → victim).
    await openDockAction(awayCoach, "Baja causada");
    await dockPickCause(awayCoach, "Bloqueo");
    await dockTapOwn(awayCoach, 2);
    await dockTapRival(awayCoach, 1);
    await dockRollAndRecord(awayCoach, 11);
    // DEC-1 ★2 on record-A causer's action card (both feeds), injury card no star.
    const blockALine = `${awayBlocker.name} hace una herida a ${homeDefenderDown.name}`;
    for (const page of [awayCoach, homeCoach]) {
      await expect(
        page.getByTestId("live-event-row").filter({ hasText: blockALine }).filter({ hasText: "(★2)" }),
      ).toBeVisible();
      await expect(
        page.getByTestId("live-event-row").filter({ hasText: `por ${awayBlocker.name}` }).filter({ hasText: "(★2)" }),
      ).toHaveCount(0);
    }

    // Record B: home NON-active dock action "Baja — ambos derribados" → the
    // home #4 defender is the CAUSER (own pool first) → victim = the rival
    // fallen blocker away #5 (rival pool) → fixed block roll → Registrar sends
    // {cause:block, bothDown:true}.
    await openDockAction(homeCoach, "Baja — ambos derribados");
    await dockTapOwn(homeCoach, 3);
    await dockTapRival(homeCoach, 4);
    await dockRollAndRecord(homeCoach, 11);
    // DEC-1 ★2 on record-B causer's action card too (the both-down marker does
    // NOT suppress PE under DEC-1), on both feeds; the victim injury card has no
    // star but carries the marker copy once for the pair.
    const blockBLine = `${homeDefenderCauser.name} hace una herida a ${awayBlockerDown.name}`;
    for (const page of [awayCoach, homeCoach]) {
      await expect(
        page.getByTestId("live-event-row").filter({ hasText: blockBLine }).filter({ hasText: "(★2)" }),
      ).toBeVisible();
      await expect(
        page.getByTestId("live-event-row").filter({ hasText: `por ${homeDefenderCauser.name}` }).filter({ hasText: "(★2)" }),
      ).toHaveCount(0);
      // Exactly one both-down-blown row — the blocker record's injury card —
      // carries the DEC-1 marker copy "Ambos derribados" (never on a plain block).
      await expect(
        page.getByTestId("live-event-row").filter({ hasText: "Ambos derribados" }).filter({ hasText: awayBlockerDown.name }),
      ).toHaveCount(1);
      await expect(
        page.getByTestId("live-event-row").filter({ hasText: "Ambos derribados" }).filter({ hasText: homeDefenderDown.name }),
      ).toHaveCount(0);
    }
    // LM-26 payload-aware ack author: record B is caused (home causer = home
    // recorder) → its author side is home, so ✓/✗ controls render ONLY to the
    // fallen blocker's coach (away) and appear on the INJURY card (matched by the
    // causer line); the home recorder's own page must never offer a manual ack.
    await expect(
      homeCoach.getByTestId("live-event-row").filter({ hasText: `por ${homeDefenderCauser.name}` }).getByRole("button", { name: /(Correcto|Revisar)/ }),
    ).toHaveCount(0);
    await expect(
      awayCoach.getByTestId("live-event-row").filter({ hasText: `por ${homeDefenderCauser.name}` }).getByRole("button", { name: /Correcto/i }),
    ).toBeVisible();
    await expect(
      awayCoach.getByTestId("live-event-row").filter({ hasText: `por ${homeDefenderCauser.name}` }).getByRole("button", { name: /Revisar/i }),
    ).toBeVisible();
    // And the pair's earliest (record A) was a plain away block — recorder away,
    // so ack controls belong to the fallen HOME defender's coach (homeCoach), not
    // on the away recorder's action card.
    await expect(
      awayCoach.getByTestId("live-event-row").filter({ hasText: `por ${awayBlocker.name}` }).getByRole("button", { name: /(Correcto|Revisar)/ }),
    ).toHaveCount(0);
    // The fallen player's coach (home, for record A) is the one offered the ack.
    await expect(
      homeCoach.getByTestId("live-event-row").filter({ hasText: `por ${awayBlocker.name}` }).getByRole("button", { name: /Correcto/i }),
    ).toBeVisible();
    // Each fallen player's coach acks their own falling record (LM-26 both-down
    // symmetry): home acks record A, away acks record B.
    await homeCoach
      .getByTestId("live-event-row")
      .filter({ hasText: `por ${awayBlocker.name}` })
      .getByRole("button", { name: /Correcto/i })
      .click();
    await awayCoach
      .getByTestId("live-event-row")
      .filter({ hasText: `por ${homeDefenderCauser.name}` })
      .getByRole("button", { name: /Correcto/i })
      .click();

    // [C] ACTIVE (away) Pase completo (★1) in TWO dock touches (action → own
    // scorer chip): through the dock (no selects). The row (★1) streams to both.
    await dockScoredAction(awayCoach, "Pase completo", 0);
    await expect(awayCoach.getByTestId("live-event-row").filter({ hasText: `${awayRoster[0].name}` }).filter({ hasText: "Pase completo" }).first()).toBeVisible();
    await expect(awayCoach.getByText("★1")).toBeVisible();

    // [D] ACTIVE (away) Touchdown (★3) in TWO touches via the dock → the hero
    // score update (away +1) + the turn flips back to home.
    await dockScoredAction(awayCoach, "Touchdown", 0);
    await expect(awayCoach.getByTestId("live-event-row").filter({ hasText: "★3" })).toBeVisible();
    // MVT-1: the away TD card carries the per-TD partial score "(home - away)"
    // derived by accumulating TD events in seq order — home 0, away 1 here.
    await expect(
      awayCoach.getByTestId("live-event-row").filter({ hasText: "(0 - 1)" }),
    ).toBeVisible();
    // The away TD lands on the away side → hero reads "0 : 1" (home : away).
    await expect(awayCoach.getByTestId("live-score")).toHaveText(/0\s*:\s*1/);
    // Turn1 away active → after the away TD the active side flips home; the TD
    // auto-end does NOT advance the round (home resumes their TURN 1 — the
    // round advances only when the round starter comes back after an end-turn).
    await expect(homeCoach.getByText(/Mitad 1 · Turno 1/).first()).toBeVisible();

    // [D] RELOAD persistence (LM-17): re-render the match page from the persisted
    // history → the Design-A rows (start / Herida / completion / TD) survive, and
    // no turn-pass row ever appears (turn kinds are filtered live-only, LM-16).
    await awayCoach.reload();
    await expect(awayCoach.getByText(/Mitad 1 · Turno 1/).first()).toBeVisible();
    for (const text of ["Inicio del partido", homeScorerName, "Pase completo", "★3"]) {
      await expect(awayCoach.getByText(new RegExp(text)).first()).toBeVisible();
    }
    await expect(awayCoach.getByText("Fin de turno")).toHaveCount(0);

    // New-device recovery: B logs in from a FRESH context (same user, a new
    // device equivalent) and gets a snapshot-first live view (turn 1 persisted).
    const freshContext = await browser.newContext({ locale: "es-ES" });
    const freshB = tight(await freshContext.newPage());
    await login(freshB, rivalEmail);
    await freshB.goto(matchUrl);
    // Snapshot-first: the fresh device converges to the current live state.
    await expect(freshB.getByText(/Mitad 1 · Turno 1/).first()).toBeVisible();
    await freshContext.close();

    // Finish the match (lifecycle, admin MayEnd). The finished live DTO then
    // triggers the RAU-49 guided resolution flow (not the manual result form).
    // (The away score is already 1 via the dock TD.)
    const afterEnd = await liveCommand(admin, leagueId, fixtureId, { type: "endMatch" });
    expect(afterEnd.view.status).toBe("finished");

    // RAU-51/RAU-52 rework: a finished live match with no result shows the
    // PER-SIDE RESOLUTION WIZARD (the manual result form is gone for live
    // matches). Each coach advances their OWN side independently through the
    // 5 steps; the reveal waits for both confirms; the LAST completion closes.
    await admin.goto(matchUrl);
    await expect(admin.getByRole("button", { name: "Reanudar" })).toBeVisible();

    // Coach A (whichever team is home) drives their OWN side: winnings → fans
    // (server-owned 1D6) → MVP checkboxes → Send → the FINAL confirm.
    const homeDialog = await driveWinningsFansMvp(homeCoach, matchUrl);
    // Coach B drives THEIR own side the same way.
    const awayDialog = await driveWinningsFansMvp(awayCoach, matchUrl);

    // BOTH confirmed → the reveal fires automatically → both sides advance to
    // the casualties step (the reveal is the ONLY joint wait).
    await driveRevealAndCasualties(homeCoach, homeDialog);
    await driveRevealAndCasualties(awayCoach, awayDialog);

    // Step 5 (journeymen): no novatos were fielded (11 healthy) → complete.
    await driveJourneymenDone(homeDialog);
    await driveJourneymenDone(awayDialog);
    // The LAST completion closes the match → the modal closes itself.
    await expect(awayDialog).not.toBeVisible({ timeout: 20_000 });

    // The admin page re-loads the RESOLVED match (whichever coach did the final
    // save) so the feed shows the closure summary deterministically.
    await admin.goto(matchUrl);

    // MVP rows (LM-mvp): once the resolve commits, the FINISHED feed on the
    // match page carries the home+away mvp rows (★4) the resolve appended.
    await expect(admin.getByText("Jugador más valioso").first()).toBeVisible();
    const mvpRows = admin.getByTestId("live-event-row").filter({ hasText: "Jugador más valioso" });
    await expect(mvpRows.filter({ hasText: "★4" })).toHaveCount(2);

    // MVT-4: the finished feed renders the snapshot summary rows ABOVE the event
    // cards — "Partido reportado" (green success + date), then Ganancias /
    // Fanáticos dedicados / Incentivos — derived from the MatchResult snapshot,
    // never new event kinds. The reported row precedes the first event card.
    await expect(
      admin.getByTestId("summary-row-reported").filter({ hasText: "Partido reportado" }),
    ).toBeVisible();
    await expect(admin.getByTestId("summary-row").filter({ hasText: "Ganancias" })).toBeVisible();
    await expect(
      admin.getByTestId("summary-row").filter({ hasText: "Fanáticos dedicados" }),
    ).toBeVisible();
    await expect(admin.getByTestId("summary-row").filter({ hasText: "Incentivos" })).toBeVisible();
    const reportedRow = admin.getByTestId("summary-row-reported");
    const firstEventCard = admin.getByTestId("live-event-row").first();
    await expect(reportedRow).toBeVisible();
    await expect(firstEventCard).toBeAttached();
    const reportedY = (await reportedRow.boundingBox())?.y ?? Infinity;
    const firstCardY = (await firstEventCard.boundingBox())?.y ?? -Infinity;
    expect(reportedY).toBeLessThan(firstCardY);

    // RAU-49 closure: the fixture is PLAYED (the normally-finished live match
    // that previously never closed), the scores are recorded and the single
    // jornada completes — the resolve command IS the closure.
    await expect
      .poll(
        async () => {
          const res = await admin.request.get(`/api/leagues/${leagueId}`);
          if (res.status() !== 200) return null;
          const body = (await res.json()) as {
            fixtures: { id: string; status?: string }[];
            rounds: { complete: boolean }[];
          };
          const fixture = body.fixtures.find((f) => f.id === fixtureId);
          return fixture?.status === "played" && body.rounds[0]?.complete === true ? "played" : null;
        },
        { timeout: 20_000 },
      )
      .toBe("played");
    await admin.goto(`/leagues/${leagueId}`);
    const region = admin.getByRole("region", { name: "Jornada 1" });
    await expect(region.getByText(/Partido 1 · Jugado/)).toBeVisible();
    // The recorded score (home 0, away 1 via the dock TD) + "Jornada completa".
    await expect(region.getByText(/(0 : 1)/)).toBeVisible();
    await expect(admin.getByText("Jornada completa")).toBeVisible();
  } finally {
    await league.close();
  }
});
