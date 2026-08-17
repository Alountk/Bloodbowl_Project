import { test, expect, type Browser, type Page } from "@playwright/test";
test.use({ locale: "es-ES" });

/**
 * Real-DB live-match E2E (auth suite only — `pnpm run test:e2e:auth` with
 * AUTH_MODE=auth + Postgres; ignored in the local `AUTH_MODE=local` suite).
 *
 * Covers the interactive 2-coach realtime slice (LM-1/LM-8/LM-11) PLUS the
 * Design-A history feed and the EventControls FAB (LM-17/LM-20):
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
 *   5. Event recording via the REAL "+" FAB (LM-20/D26): the ACTIVE coach
 *      records a Pase completo (completion ★1) and a Touchdown (★3) through the
 *      mini-form (feed rows appear live), while the NON-active coach's "+" menu
 *      offers ONLY Herida and records a casualty to their own player (LM-12);
 *   6. reload persistence: the match page re-renders the same Design-A history
 *      from the persisted events (no turn rows, a reload does not drop them);
 *   7. a finished live match shows the RAU-49 guided RESOLUTION flow — the
 *      persistent "Resolver partido" banner + the two-step modal (six MJP
 *      nominations per team, a server-owned roll, then "Guardar y reportar") —
 *      and, once resolved, the finished feed carries the home+away mvp rows
 *      (★4), the snapshot summary rows, the fixture is PLAYED with the recorded
 *      score and the single jornada completes (the resolve command IS the
 *      closure, replacing the old result-modal prefill flow).
 *
 * Tourplay redesign guards (MVT-1/2/3/4) are asserted against the REAL UI:
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

/**
 * Records a live event through the REAL "+" FAB (LM-20/D26): opens the FAB,
 * clicks the given menu label and picks the player from the roster select,
 * then submits. The menu closes on submit. Casualty recording is NOT routed
 * here — the two-phase (propose → confirm) and self-inflicted paths are driven
 * inline (RAU-39: the band is never a select, it derives from the 1D16 roll).
 */
async function recordViaFab(page: Page, menuLabel: string, playerName: string) {
  await page.getByRole("button", { name: "+" }).click();
  await page.getByRole("button", { name: new RegExp(menuLabel, "i") }).click();
  await page.getByLabel("Jugador").selectOption({ label: playerName });
  await page.getByRole("button", { name: "Registrar" }).click();
  // Menu + form close again after the submit.
  await expect(page.getByLabel("Jugador")).toHaveCount(0);
}

test("two-context SSE sync + new-device recovery + result prefill", async ({ browser }) => {
  const tag = Date.now().toString(36);
  const league = await buildStartedLeague(browser, tag);
  try {
    const { admin, rival, leagueId, rivalEmail, adminTeam, rivalTeam } = league;
    const { fixtureId, homeTeamName, awayTeamName, homeScorerName, awayScorerName } = await fixtureAndScorers(admin, leagueId);
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

    // MVT-2/MVT-3: the sticky Tourplay header renders the back arrow to the
    // jornada and the horizontal timeline bar once the match is live. The bar
    // derives from the LM-16 display events only, so a reload reproduces it.
    const header = admin.getByTestId("tourplay-header");
    await expect(header).toBeVisible();
    await expect(
      header.getByRole("link", { name: "Volver a la jornada" }),
    ).toHaveAttribute("href", `/leagues/${leagueId}`);
    await expect(header.getByTestId("match-timeline")).toBeVisible();

    // LM-12/D19: the first ACTIVE side after begin is home (LM-3: half 1 turn 1
    // home). Only the ACTIVE coach sees the "Turno {team}" STATUS + "Dar el
    // turno"; the non-active coach sees "Pedir turno" and never "Dar el turno".
    // The timeline turn-start card ALSO reads "Turno {homeTeamName}" (RAU-36/37),
    // so target the role=status element (Chromium does not expose a name for
    // live-region roles, hence no `name:` filter).
    await expect(homeCoach.getByRole("status")).toHaveText(`Turno ${homeTeamName}`);
    await expect(homeCoach.getByRole("button", { name: "Dar el turno" })).toBeVisible();
    await expect(homeCoach.getByRole("button", { name: "Pedir turno" })).toHaveCount(0);
    await expect(awayCoach.getByRole("status")).toHaveCount(0);
    await expect(awayCoach.getByRole("button", { name: "Pedir turno" })).toBeVisible();
    await expect(awayCoach.getByRole("button", { name: "Dar el turno" })).toHaveCount(0);

    // The ACTIVE (home) coach DOUBLE-CLICKS "Dar el turno" → the in-flight lock
    // drops the second invocation, so the turn flips by EXACTLY ONE. A raw
    // pointer dblclick lands the second click while the first endTurn is still
    // in flight (no actionability waits) — the pre-lock bug sent a second
    // endTurn and jumped the turn by two. The hub then fans the new state out
    // over SSE: the OTHER coach's page converges WITHOUT any reload — the live
    // `event` frame (turn + turnStart deltas) applies the flipped state.
    const passButton = homeCoach.getByRole("button", { name: "Dar el turno" });
    await expect(passButton).toBeVisible();
    const box = (await passButton.boundingBox())!;
    await homeCoach.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await expect(homeCoach.getByText(/Mitad 1 · Turno 2/).first()).toBeVisible();
    await expect(awayCoach.getByText(/Mitad 1 · Turno 2/).first()).toBeVisible();
    // Regression: exactly one flip — turn 3 never appears, the away coach is
    // the one now active ("Turno {awayTeamName}"), and the home coach's status
    // is gone.
    await expect(awayCoach.getByRole("status")).toHaveText(`Turno ${awayTeamName}`);
    await expect(homeCoach.getByText(/Mitad 1 · Turno 3/)).toHaveCount(0);
    await expect(homeCoach.getByRole("status")).toHaveCount(0);

    // LM-13: the now-NON-active coach (home) clicks "Pedir turno" → the
    // requestTurn delta event streams to the ACTIVE (away) coach's page and the
    // "Tu rival pide el turno" banner appears live — no reload. The requester's
    // own page never shows it (it stays non-active).
    await expect(homeCoach.getByRole("button", { name: "Pedir turno" })).toBeVisible();
    await homeCoach.getByRole("button", { name: "Pedir turno" }).click();
    await expect(awayCoach.getByText("Tu rival pide el turno")).toBeVisible();
    await expect(homeCoach.getByText("Tu rival pide el turno")).toHaveCount(0);

    // DESIGN-A feed (LM-17) + EventControls (LM-20/D26) — recorded through the
    // REAL "+" FAB. At Turn 2 the AWAY coach is ACTIVE and the HOME coach is
    // NON-active, so each role's menu is exercised deterministically (home/away
    // side is resolved above; the player names come from the fixture rosters).
    //
    // [A] NON-active (home) coach: the "+" menu offers ONLY Herida (casualty to
    // their own player) — no TD / Pase completo / Falta rows (LM-20 scenario).
    // RAU-39: the NON-active form records a SELF-INFLICTED (dodge/crowd)
    // casualty with the 1D16 roll — the band is derived server-side, NEVER a
    // band select.
    await homeCoach.getByRole("button", { name: "+" }).click();
    await expect(homeCoach.getByText("Herida")).toBeVisible();
    await expect(homeCoach.getByRole("button", { name: /Touchdown/i })).toHaveCount(0);
    await expect(homeCoach.getByRole("button", { name: /Pase completo/i })).toHaveCount(0);
    await expect(homeCoach.getByRole("button", { name: /Falta/i })).toHaveCount(0);
    await homeCoach.getByRole("button", { name: /Herida/i }).click();
    await expect(homeCoach.getByLabel("Víctima")).toBeVisible();
    await homeCoach.getByLabel("Víctima").selectOption({ label: homeScorerName });
    // Only self-inflicted causes are offered to the NON-active coach.
    await homeCoach.getByLabel("Causa de la lesión").selectOption({ label: "Esquivando — se cayó" });
    await expect(homeCoach.getByLabel("Autor de la lesión")).toHaveCount(0);
    await expect(homeCoach.getByLabel("Tipo de lesión")).toHaveCount(0);
    await homeCoach.getByLabel("Tirada 1D16").selectOption({ value: "9" });
    await homeCoach.getByRole("button", { name: "Registrar" }).click();
    await expect(homeCoach.getByLabel("Víctima")).toHaveCount(0);
    // The self-inflicted casualty card (victim = own home player) renders with
    // the derived band + roll line, and NO "por …" causer line.
    await expect(
      homeCoach.getByTestId("live-event-row").filter({ hasText: homeScorerName }),
    ).toBeVisible();
    await expect(homeCoach.getByTestId("live-event-row").filter({ hasText: "Tirada 1D16: 9" })).toBeVisible();

    // [A2] TWO-PHASE casualty (RAU-39): the ACTIVE (away) coach PROPOSES the
    // injury THEY inflicted (causer = away scorer, victim = home player, roll16);
    // the NON-active (home) coach CONFIRMS it in the turn zone. The band is
    // derived server-side from the roll — the proposal never carries a band.
    await awayCoach.getByRole("button", { name: "+" }).click();
    await awayCoach.getByRole("button", { name: /Herida/i }).click();
    await expect(awayCoach.getByLabel("Víctima")).toBeVisible();
    await awayCoach.getByLabel("Víctima").selectOption({ label: homeScorerName });
    await awayCoach.getByLabel("Causa de la lesión").selectOption({ label: "Blitz" });
    await awayCoach.getByLabel("Autor de la lesión").selectOption({ label: awayScorerName });
    await awayCoach.getByLabel("Tirada 1D16").selectOption({ value: "9" });
    await expect(awayCoach.getByLabel("Tipo de lesión")).toHaveCount(0);
    await awayCoach.getByRole("button", { name: /Proponer/i }).click();
    await expect(awayCoach.getByLabel("Víctima")).toHaveCount(0);
    // The proposer (away) waits inline; the defender (home) sees the derived
    // details in an EXPLANATORY MODAL (RAU-43) and confirms — the SSE hub
    // converges both pages without a reload.
    await expect(awayCoach.getByText(/Esperando confirmación del rival/)).toBeVisible();
    await expect(homeCoach.getByRole("dialog", { name: /Baja registrada por el rival/i })).toBeVisible();
    await expect(homeCoach.getByText(/El rival registra una baja/)).toBeVisible();
    await expect(homeCoach.getByText(/1D16 9/)).toBeVisible();
    await homeCoach.getByRole("button", { name: "Confirmar" }).click();
    await expect(homeCoach.getByRole("dialog", { name: /Baja registrada por el rival/i })).toHaveCount(0);
    // The ONE casualty event renders the injury card on the victim's (home) side
    // with the MVT-5 causer line AND the derived action card on the causer's
    // (away) side — both feeds converge via the hub.
    await expect(
      homeCoach.getByTestId("live-event-row").filter({ hasText: homeScorerName }),
    ).toBeVisible();
    await expect(
      homeCoach.getByTestId("live-event-row").filter({ hasText: `por ${awayScorerName}` }),
    ).toBeVisible();
    await expect(
      awayCoach.getByTestId("live-event-row").filter({ hasText: "· Blitz" }),
    ).toBeVisible();

    // [B] ACTIVE (away) coach records a Pase completo (completion ★1) through the
    // FAB mini-form → a completion Design-A row (★1) streams into both feeds.
    await recordViaFab(awayCoach, "Pase completo", awayScorerName);
    await expect(awayCoach.getByText("Pase completo").first()).toBeVisible();

    // [C] ACTIVE (away) coach records a Touchdown via the FAB → the Design-A TD
    // row (★3) + the hero score update (away +1) + the turn flips back to home.
    await recordViaFab(awayCoach, "Touchdown", awayScorerName);
    await expect(awayCoach.getByTestId("live-event-row").filter({ hasText: "★3" })).toBeVisible();
    // MVT-1: the away TD card carries the per-TD partial score "(home - away)"
    // derived by accumulating TD events in seq order — home 0, away 1 here.
    await expect(
      awayCoach.getByTestId("live-event-row").filter({ hasText: "(0 - 1)" }),
    ).toBeVisible();
    // The away TD lands on the away side → hero reads "0 : 1" (home : away).
    await expect(awayCoach.getByTestId("live-score")).toHaveText(/0\s*:\s*1/);
    // Turn2 away active → after the away TD the active side flips home.
    await expect(homeCoach.getByText(/Mitad 1 · Turno 2/).first()).toBeVisible();

    // [D] RELOAD persistence (LM-17): re-render the match page from the persisted
    // history → the Design-A rows (start / Herida / completion / TD) survive, and
    // no turn-pass row ever appears (turn kinds are filtered live-only, LM-16).
    await awayCoach.reload();
    await expect(awayCoach.getByText(/Mitad 1 · Turno 2/).first()).toBeVisible();
    for (const text of ["Inicio del partido", homeScorerName, "Pase completo", "★3"]) {
      await expect(awayCoach.getByText(new RegExp(text)).first()).toBeVisible();
    }
    await expect(awayCoach.getByText("Fin de turno")).toHaveCount(0);

    // New-device recovery: B logs in from a FRESH context (same user, a new
    // device equivalent) and gets a snapshot-first live view (turn 2 persisted).
    const freshContext = await browser.newContext({ locale: "es-ES" });
    const freshB = tight(await freshContext.newPage());
    await login(freshB, rivalEmail);
    await freshB.goto(matchUrl);
    // Snapshot-first: the fresh device converges to the current live state.
    await expect(freshB.getByText(/Mitad 1 · Turno 2/).first()).toBeVisible();
    await freshContext.close();

    // Finish the match (lifecycle, admin MayEnd). The finished live DTO then
    // triggers the RAU-49 guided resolution flow (not the manual result form).
    // (The away score is already 1 via the FAB TD.)
    const afterEnd = await liveCommand(admin, leagueId, fixtureId, { type: "endMatch" });
    expect(afterEnd.view.status).toBe("finished");

    // RAU-49: a finished live match with no result shows the guided resolution
    // flow (the manual result form is gone for live matches). A fresh load of
    // the finished-unresolved match shows the persistent "Resolver partido"
    // banner; the modal auto-opens once when the match finishes via SSE.
    await admin.goto(matchUrl);
    await expect(admin.getByRole("button", { name: "Resolver partido" })).toBeVisible();
    await admin.getByRole("button", { name: "Resolver partido" }).click();
    const dialog = admin.getByRole("dialog", { name: "Resolver partido" });
    await expect(dialog).toBeVisible();

    // Step 1 — MVP (mandatory): six DISTINCT MJP nominations per team (option
    // index i = player i, mirroring the result modal's nomination contract).
    for (const team of [homeTeamName, awayTeamName]) {
      for (let i = 1; i <= 6; i++) {
        await dialog.getByLabel(`MVP ${i} ${team}`).selectOption({ index: i });
      }
    }
    // The SERVER owns the 1D6 MVP roll: "Tirar MVP" posts the read-only
    // rollMvp command and reveals the grantees + the summary (winnings → the
    // finish-time persisted values, dedicated fans, match PE).
    await dialog.getByRole("button", { name: "Tirar MVP" }).click();
    await expect(dialog.getByText("Resumen de la resolución")).toBeVisible();
    // Step 2 — "Guardar y reportar" posts resolveMatch (THE closure): the
    // fixture closes + the MatchResult row writes + the league finishes.
    await dialog.getByRole("button", { name: "Guardar y reportar" }).click();
    await expect(dialog).not.toBeVisible();

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
    // The recorded score (home 0, away 1 via the FAB TD) + "Jornada completa".
    await expect(region.getByText(/(0 : 1)/)).toBeVisible();
    await expect(admin.getByText("Jornada completa")).toBeVisible();
  } finally {
    await league.close();
  }
});
