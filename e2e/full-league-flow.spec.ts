import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
test.use({ locale: "es-ES" });

/**
 * Real-DB full-league-flow E2E (run via `pnpm run test:e2e:auth` with
 * AUTH_MODE=auth and a running Postgres). A single end-to-end journey covering
 * the COMPLETE league lifecycle in one spec file (the happy path chains state
 * through the shared DB with unique emails per run), plus the cross-cutting
 * edge cases as separate test blocks that each build their own fresh league:
 *
 *   1. full journey: admin signs up → team (11) → league → joins own team;
 *      rival signs up → team (11) → sees the OPEN league under "Ligas abiertas"
 *      → joins; admin starts a 1-jornada season → single A-vs-B matchup; rival
 *      proposes a date and admin accepts → "Programado"; admin loads a 2–1 win
 *      through the real "Acta del partido" wizard (per-player actions, a
 *      casualty victim, both MVPs) → "Partido 1 · Jugado" + the center "2 : 1"
 *      highlighted + "Jornada completa"; the RIVAL then
 *      spends the PE its scorer earned (1 TD + 2 completions + 1 interception =
 *      7 PE) on the élite primary Block through the roster improve modal →
 *      skill + ◆ diamond + value update;
 *      admin corrects the played result to 1–1 → the MatchCard updates.
 *   2. outsider (non-member) gets 404 on the started detail AND on the
 *      proposals and result routes (no existence leak).
 *   3. repeat result load on an already-played fixture is rejected (409), the
 *      UI no longer offers "Acta del partido", and forfeit-after-result is 409.
 *   4. forfeit walkover: admin forfeits a scheduled fixture → "Jugado" with
 *      2–0 → round completes; result-after-forfeit is 409 (mutual exclusion).
 *   5. a captain CAN load a result but cannot correct it (no UI control; the
 *      PUT is 403) — and both participants see "Acta del partido" on the card.
 *   6. unauthenticated result POST → 401.
 *   7. the server rejects a result whose per-player TDs do not sum to the
 *      reported score (400) and leaves the fixture untouched.
 *   8. the wizard blocks a submit with a missing MVP client-side (MAW-8: saving
 *      needs Σ anotaciones == marcador and both MVPs).
 *
 * Every user runs in its own Playwright browser context (isolated sessions
 * share the DB); all names/emails are unique per run so the persisted Postgres
 * never collides and the suite is idempotent. Scheduling is driven through the
 * API (already covered via the UI negotiation in league-matchday); results,
 * corrections, forfeits and progression go through the REAL UI to keep this a
 * full journey. NOTE (auth cold-start race): the first auth-suite run after a
 * fresh boot can time out on /signup; a re-run is green.
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
  await page.getByLabel("Descripción").fill("Liga completa multi-jugador");
  await page.getByRole("button", { name: "Crear liga" }).click();
  await expect(page.getByText(name)).toBeVisible();
}

/** Opens the league card named `leagueName` and returns its detail URL. */
async function openLeagueCard(page: Page, leagueName: string): Promise<string> {
  await page
    .locator("li")
    .filter({ hasText: leagueName })
    .getByRole("link", { name: "Ver", exact: true })
    .click();
  await expect(page).toHaveURL(/\/leagues\/.+$/);
  return page.url();
}

/** A future local slot (days ahead at HH:MM) plus its es-ES label regex. */
function futureSlot(
  daysAhead: number,
  hours: number,
  minutes: number,
): { iso: string; esRegex: RegExp } {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hours, minutes, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  return { iso: d.toISOString(), esRegex: new RegExp(`${day}/${m}/${y}, ${hh}:${mm}`) };
}

/** A started 2-member league (admin A owns the league AND a team; rival B
 * joins). The round-robin yields exactly one 1-jornada, 1-fixture match A×B. */
interface TwoMemberLeague {
  admin: Page;
  rival: Page;
  leagueId: string;
  teamAName: string;
  teamBName: string;
  close: () => Promise<void>;
}

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
    await signup(admin, uniqueEmail(`fl-admin-${tag}`));
    const teamAName = `FA-${tag} ${Date.now()}`;
    await createTeam(admin, teamAName);
    const leagueName = `FL Liga ${tag} ${Date.now()}`;
    await createLeague(admin, leagueName);
    const leagueUrl = await openLeagueCard(admin, leagueName);
    const leagueId = /\/leagues\/(.+)$/.exec(leagueUrl)?.[1];
    expect(leagueId).toBeDefined();
    await admin.getByLabel("Tu equipo").selectOption({ label: teamAName });
    await admin.getByRole("button", { name: "Apuntarse" }).click();
    await expect(admin.getByText(teamAName)).toBeVisible();

    await signup(rival, uniqueEmail(`fl-rival-${tag}`));
    const teamBName = `FB-${tag} ${Date.now()}`;
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

/** Read the started league's single fixture + member teams via the caller's
 * session (member/admin only — a foreign session 404s). */
interface LeagueSnapshot {
  fixtureId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  teams: { id: string; name: string; roster: { id: string; name: string }[] }[];
}

async function snapshotLeague(page: Page, leagueId: string): Promise<LeagueSnapshot> {
  const res = await page.request.get(`/api/leagues/${leagueId}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    fixtures: {
      id: string;
      homeTeamId: string;
      awayTeamId: string;
      homeScore: number | null;
      awayScore: number | null;
      status: string;
    }[];
    teams: { id: string; name: string; roster: { id: string; name: string }[] }[];
  };
  const fixture = body.fixtures[0];
  expect(fixture).toBeDefined();
  return {
    fixtureId: fixture.id,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
    status: fixture.status,
    teams: body.teams,
  };
}

/** Builds a valid ResultPayload for the snapshot: `score` per side, both TDs
 * credited to the first roster player of each team, six distinct MJP
 * nominations per team, no casualties, ball held. `homeTds`/`awayTds` override
 * the credited TD count (used to test the ΣTD==score rejection). */
function resultPayloadFor(
  snap: LeagueSnapshot,
  opts: {
    homeScore: number;
    awayScore: number;
    homeTds?: number;
    awayTds?: number;
  },
) {
  const rosterOf = (id: string) => snap.teams.find((t) => t.id === id)?.roster ?? [];
  const home = rosterOf(snap.homeTeamId);
  const away = rosterOf(snap.awayTeamId);
  const actionsFor = (roster: { id: string }[], tds: number) =>
    roster.map((p, i) => ({
      rosterPlayerId: p.id,
      tds: i === 0 ? tds : 0,
      casualties: 0,
      completions: 0,
      interceptions: 0,
      fouls: 0,
      throwTeamMates: 0,
      landedSafe: 0,
    }));
  return {
    home: {
      score: opts.homeScore,
      ballHeld: true,
      players: actionsFor(home, opts.homeTds ?? opts.homeScore),
      mvp: { nominations: home.slice(0, 6).map((p) => p.id) },
      casualties: [],
    },
    away: {
      score: opts.awayScore,
      ballHeld: true,
      players: actionsFor(away, opts.awayTds ?? opts.awayScore),
      mvp: { nominations: away.slice(0, 6).map((p) => p.id) },
      casualties: [],
    },
  };
}

/** Schedules the single fixture: the rival proposes a date, the admin accepts.
 * Returns the fixture id. */
async function scheduleFixture(
  admin: Page,
  rival: Page,
  leagueId: string,
): Promise<string> {
  const snap = await snapshotLeague(admin, leagueId);
  const slot = futureSlot(10, 18, 0);
  const proposal = await rival.request.post(
    `/api/leagues/${leagueId}/fixtures/${snap.fixtureId}/propose`,
    { data: { date: slot.iso } },
  );
  expect(proposal.status()).toBe(200);
  const prop = (await proposal.json()) as { id: string };
  const accepted = await admin.request.post(
    `/api/leagues/${leagueId}/fixtures/${snap.fixtureId}/accept`,
    { data: { proposalId: prop.id } },
  );
  expect(accepted.status()).toBe(200);
  return snap.fixtureId;
}

/** Polls the league detail until the given fixture reaches a status. The
 * modal/API mutations resolve in the background; this emulates the UI refresh
 * without racing the commit. */
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

/** One free-form action to record on the wizard's Acciones step (MAW-4). */
interface ActaActionFill {
  /** Roster player NAME shown in the "Jugador {slot} · {team}" select. */
  player: string;
  kind:
    | "td"
    | "casualty"
    | "completion"
    | "interception"
    | "foul"
    | "throwTeamMate"
    | "landedSafe";
  quantity?: number;
  /** Casualty only: the victim option VALUE (`${side}:${rosterPlayerId}`). */
  victim?: string;
}

/** Opens the "Acta del partido" wizard (the single entry point that replaced the
 * legacy ResultModal in s4b/s6c) and returns its dialog. */
async function openActaWizard(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Acta del partido" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Acta del partido" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Advances the wizard to the next step. */
async function nextStep(dialog: Locator) {
  await dialog.getByRole("button", { name: "Siguiente" }).click();
}

/** Adds one free-form Acciones line for `teamName` at 1-based `slot`. Every
 * locator is scoped by team NAME, so a shuffled home/away side does not matter. */
async function addActionLine(
  dialog: Locator,
  teamName: string,
  slot: number,
  action: ActaActionFill,
) {
  const team = dialog.getByRole("region", { name: teamName, exact: true });
  await team
    .getByRole("button", { name: `Añadir acción · ${teamName}`, exact: true })
    .click();
  // The Acciones line labels WRAP their <select>, so an exact match would include
  // the option text; the " · " separator already prevents slot collisions.
  await team
    .getByLabel(`Jugador ${slot} · ${teamName}`)
    .selectOption({ label: action.player });
  // "Acción N" also appears in the remove button's aria-label ("Eliminar acción N"),
  // so scope the kind select to the combobox role to disambiguate.
  await team
    .getByRole("combobox", { name: `Acción ${slot} · ${teamName}` })
    .selectOption(action.kind);
  if (action.quantity !== undefined) {
    await team
      .getByLabel(`Cantidad ${slot} · ${teamName}`)
      .fill(String(action.quantity));
  }
  if (action.victim !== undefined) {
    await team
      .getByLabel(`Víctima ${slot} · ${teamName}`)
      .selectOption(action.victim);
  }
}

/** Selects the single MVP for `teamName` (MAW-8 requires BOTH teams to have one). */
async function selectMvp(dialog: Locator, teamName: string, player: string) {
  await dialog
    .getByRole("radio", { name: `MVP · ${teamName} · ${player}`, exact: true })
    .check();
}

/** Loads a `score`–0 win for `adminTeamName` through the real "Acta del partido"
 * wizard: its Player 1 takes every TD and BOTH teams pick an MVP, because the
 * MAW-8 save-block refuses to save unless Σ anotaciones == marcador AND both
 * teams have an MVP. */
async function loadResultViaModal(
  page: Page,
  adminTeamName: string,
  rivalTeamName: string,
  score: number,
) {
  const dialog = await openActaWizard(page);

  // Step 0 · Contexto — the defaults are valid (Perfecto weather, no FF).
  await nextStep(dialog);

  // Step 1 · Marcador — winner scores `score`, loser 0.
  await dialog.getByLabel(adminTeamName, { exact: true }).fill(String(score));
  await dialog.getByLabel(rivalTeamName, { exact: true }).fill("0");
  await nextStep(dialog);

  // Step 2 · Acciones — the winner's Player 1 takes every TD in one line; the
  // loser records nothing (its marcador is 0, so Σ anotaciones must be 0).
  await addActionLine(dialog, adminTeamName, 1, {
    player: "Player 1",
    kind: "td",
    quantity: score,
  });
  await nextStep(dialog);

  // Step 3 · MVP — exactly one per team (the MAW-8 save-block requires both).
  await selectMvp(dialog, adminTeamName, "Player 1");
  await selectMvp(dialog, rivalTeamName, "Player 1");
  await nextStep(dialog);

  // Step 4 · Bajas — no casualties recorded, advance.
  await nextStep(dialog);
  // Step 5 · Final — the fan 1D6 is optional, advance.
  await nextStep(dialog);

  // Step 6 · Revisar — the acta validates, save.
  await dialog.getByRole("button", { name: "Guardar acta" }).click();
  await expect(dialog).not.toBeVisible();
}

// --- Journey 1: the complete league lifecycle ---------------------------------
test("complete lifecycle: join → start → schedule → result → progression → correction", async ({
  browser,
}) => {
  const contextA = await browser.newContext({ locale: "es-ES" });
  const contextB = await browser.newContext({ locale: "es-ES" });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    // --- A (admin): signup, team (11), league, joins with their own team ---
    await signup(pageA, uniqueEmail("flc-admin"));
    const teamAName = `FLCA ${Date.now()}`;
    await createTeam(pageA, teamAName);
    const leagueName = `Liga Completa ${Date.now()}`;
    await createLeague(pageA, leagueName);
    const leagueUrl = await openLeagueCard(pageA, leagueName);
    const leagueId = /\/leagues\/(.+)$/.exec(leagueUrl)?.[1];
    expect(leagueId).toBeDefined();
    await pageA.getByLabel("Tu equipo").selectOption({ label: teamAName });
    await pageA.getByRole("button", { name: "Apuntarse" }).click();
    await expect(pageA.getByText(teamAName)).toBeVisible();

    // --- B (member): signup, team (11), sees A's OPEN league, joins ---
    await signup(pageB, uniqueEmail("flc-rival"));
    const teamBName = `FLCB ${Date.now()}`;
    await createTeam(pageB, teamBName);
    await pageB.goto("/leagues");
    await expect(pageB.getByRole("heading", { level: 1, name: "Mis Ligas" })).toBeVisible();
    await expect(pageB.getByRole("heading", { name: "Ligas abiertas" })).toBeVisible();
    await expect(
      pageB.locator("section").filter({ hasText: "Ligas abiertas" }).getByText(leagueName),
    ).toBeVisible();
    await openLeagueCard(pageB, leagueName);
    await pageB.getByLabel("Tu equipo").selectOption({ label: teamBName });
    await pageB.getByRole("button", { name: "Apuntarse" }).click();
    await expect(pageB.getByText(teamBName)).toBeVisible();

    // --- A: reload → 2 members → start a 1-jornada season ---
    await pageA.reload();
    await expect(pageA.getByRole("heading", { name: leagueName })).toBeVisible();
    await expect(pageA.getByText("2 equipos")).toBeVisible();
    const startButton = pageA.getByRole("button", { name: "Iniciar liga" });
    await expect(startButton).toBeEnabled();
    await startButton.click();
    await expect(pageA.getByRole("dialog", { name: "Iniciar liga" })).toBeVisible();
    await pageA.getByLabel("¿Cuántas jornadas?").fill("1");
    await pageA
      .getByRole("dialog", { name: "Iniciar liga" })
      .getByRole("button", { name: "Iniciar liga" })
      .click();
    await expect(pageA.getByText("Iniciada")).toBeVisible();
    const startedRegion = pageA.getByRole("region", { name: "Jornada 1" });
    await expect(startedRegion).toBeVisible();
    await expect(startedRegion.getByText(teamAName)).toBeVisible();
    await expect(startedRegion.getByText(teamBName)).toBeVisible();
    // Exactly one matchup in this single round — its CENTER SCORE (rulebook).
    await expect(startedRegion.getByTestId("match-card-score")).toHaveCount(1);

    // B reloads onto the started jornada.
    await pageB.reload();
    await expect(pageB.getByText("Iniciada")).toBeVisible();

    // --- Matchday negotiation: B proposes a date, A accepts → Programado ---
    const fixtureId = await scheduleFixture(pageA, pageB, leagueId as string);
    await waitForFixtureStatus(pageA, leagueId as string, fixtureId, "scheduled");
    await pageA.reload();
    const scheduledCard = pageA.getByRole("region", { name: "Jornada 1" });
    await expect(scheduledCard.getByText(/Partido 1 · Programado/)).toBeVisible();
    await expect(scheduledCard.getByText("Programado:")).toBeVisible();
    await expect(scheduledCard.getByText(futureSlot(10, 18, 0).esRegex)).toBeVisible();

    // --- Result: A loads 2–1 via the "Acta del partido" wizard (per-player
    // actions + a casualty victim) ---
    const dialog = await openActaWizard(pageA);

    // Victim = rival's Player 2 (resolve its side + roster id via the API).
    const snap = await snapshotLeague(pageA, leagueId as string);
    const teamBId = snap.teams.find((t) => t.name === teamBName)?.id;
    expect(teamBId).toBeDefined();
    const bPlayer2 = snap.teams.find((t) => t.id === teamBId)?.roster[1];
    expect(bPlayer2).toBeDefined();
    const bSide = snap.homeTeamId === teamBId ? "home" : "away";
    const victimValue = `${bSide}:${bPlayer2!.id}`;

    // Step 0 · Contexto — defaults are valid.
    await nextStep(dialog);
    // Step 1 · Marcador — A 2, B 1.
    await dialog.getByLabel(teamAName, { exact: true }).fill("2");
    await dialog.getByLabel(teamBName, { exact: true }).fill("1");
    await nextStep(dialog);
    // Step 2 · Acciones — A: Player 1 ×2 TDs, Player 2 causes a casualty on B's
    // Player 2; B: Player 1 1 TD + 2 completions + 1 interception (7 PE).
    await addActionLine(dialog, teamAName, 1, {
      player: "Player 1",
      kind: "td",
      quantity: 2,
    });
    await addActionLine(dialog, teamAName, 2, {
      player: "Player 2",
      kind: "casualty",
      victim: victimValue,
    });
    await addActionLine(dialog, teamBName, 1, {
      player: "Player 1",
      kind: "td",
      quantity: 1,
    });
    await addActionLine(dialog, teamBName, 2, {
      player: "Player 1",
      kind: "completion",
      quantity: 2,
    });
    await addActionLine(dialog, teamBName, 3, {
      player: "Player 1",
      kind: "interception",
      quantity: 1,
    });
    await nextStep(dialog);
    // Step 3 · MVP — one per team (MAW-8 requires both).
    await selectMvp(dialog, teamAName, "Player 1");
    await selectMvp(dialog, teamBName, "Player 1");
    await nextStep(dialog);
    // Step 4 · Bajas — the derived casualty's 1D16 is server-owned (left blank).
    await nextStep(dialog);
    // Step 5 · Final — the fan 1D6 is optional.
    await nextStep(dialog);
    // Step 6 · Revisar — the acta validates, save.
    await dialog.getByRole("button", { name: "Guardar acta" }).click();
    await expect(dialog).not.toBeVisible();

    await waitForFixtureStatus(pageA, leagueId as string, fixtureId, "played");
    await pageA.reload();
    const playedRegion = pageA.getByRole("region", { name: "Jornada 1" });
    await expect(playedRegion.getByText(/Partido 1 · Jugado/)).toBeVisible();
    // The fixture home/away sides are shuffled at start; A's 2–1 win renders
    // in home–away order, so accept either orientation of the CENTER score.
    await expect(playedRegion.getByText(/(2 : 1|1 : 2)/)).toBeVisible();
    // The winner's team column carries the VICTORIA chip (Design B replaces the
    // old "Ganador:" footer line with the winner highlight).
    await expect(playedRegion.getByText("VICTORIA")).toBeVisible();
    await expect(playedRegion.locator('[data-winner="true"]').getByRole("link").first()).toHaveText(teamAName);
    await expect(pageA.getByText("Jornada completa")).toBeVisible();

    // --- Progression: B (owner) spends the scorer's 7 PE on élite Block ---
    await pageB.goto(`/teams/${teamBId}`);
    await expect(pageB.getByTestId("team-roster-table")).toBeVisible();
    const p1Id = snap.teams.find((t) => t.id === teamBId)!.roster[0].id;
    const peTestId = `spp-pe-${p1Id}`;
    const valueTestId = `player-value-${p1Id}`;
    // Player 1 earned 7 PE (1 TD + 2 completions + 1 interception) plus the +4
    // MVP grant (it is the direct MVP) — always ≥ the 6-PE primary.
    const peBefore = Number(
      (await pageB.getByTestId(peTestId).first().textContent())?.trim().replace(/[^\d]/g, ""),
    );
    expect(peBefore).toBeGreaterThanOrEqual(6);
    await expect(pageB.getByTestId(valueTestId).first()).toHaveText("50 000");
    // Row click opens the improve modal; buy Block as a primary (élite, G access
    // on a human lineman) and confirm with ACEPTAR.
    await pageB.getByTestId(`roster-row-${p1Id}`).click();
    const modal = pageB.getByTestId("improve-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId("modal-pe-label")).toHaveText(/★\d+ disponibles/);
    await modal.getByTestId("upgrade-select").selectOption("primary:block");
    await modal.getByTestId("modal-accept").click();
    await expect(modal).not.toBeVisible();

    // After a reload the skill persists: Block with the ◆ élite diamond, value
    // +20.000, and exactly 6 PE spent.
    await pageB.reload();
    const afterRow = pageB.getByTestId(`roster-row-${p1Id}`);
    // The es display name is "Placar" (slice-2 OCR correction); Block = the élite skill id.
    await expect(afterRow.getByText("Placar")).toBeVisible();
    await expect(afterRow.getByTestId("elite-diamond")).toBeVisible();
    await expect(pageB.getByTestId(valueTestId).first()).toHaveText("70 000");
    await expect(pageB.getByTestId(peTestId).first()).toHaveText(`★${peBefore - 6}`);

    // --- Season close (RAU-40): the loaded result was the season's LAST fixture
    // (2-member, 1-jornada league) → the league finishes DEFINITIVELY and the
    // champion (team A, the 2–1 winner) is declared and stored. ---
    await pageA.reload();
    await expect(pageA.getByText("Finalizada", { exact: true })).toBeVisible();
    const championPanel = pageA.getByTestId("champion-panel");
    await expect(championPanel).toBeVisible();
    await expect(championPanel.getByText("Campeón")).toBeVisible();
    await expect(championPanel.getByText(teamAName)).toBeVisible();
    await expect(championPanel.getByText("Temporada finalizada")).toBeVisible();
    // RAU-40 standings: the table shows team A (the 2–1 winner) at #1 and the
    // stored champion row is highlighted in gold.
    const standings = pageA.getByTestId("standings-table");
    await expect(standings).toBeVisible();
    await expect(standings.getByRole("heading", { name: "Clasificación" })).toBeVisible();
    const championRow = standings.getByTestId("standings-champion-row");
    await expect(championRow).toBeVisible();
    await expect(championRow.getByText(teamAName)).toBeVisible();
    // The played card stays visible, but the correction affordance is gone
    // (the overflow hides entirely once the league is finished).
    await expect(pageA.getByRole("button", { name: "Más acciones" })).toHaveCount(0);
    await expect(pageA.getByRole("menuitem", { name: "Corregir resultado" })).toHaveCount(0);
    // A correction PUT is definitively rejected (409) — the champion is final.
    const snapAfterClose = await snapshotLeague(pageA, leagueId as string);
    const rejectedCorrection = await pageA.request.put(
      `/api/leagues/${leagueId}/fixtures/${fixtureId}/result`,
      { data: resultPayloadFor(snapAfterClose, { homeScore: 1, awayScore: 1, homeTds: 1, awayTds: 1 }) },
    );
    expect(rejectedCorrection.status()).toBe(409);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

// --- Journey 2: outsider (non-member) is 404 everywhere on a started league ---
test("outsider gets 404 on the started detail, proposals, and result routes", async ({
  browser,
}) => {
  const league = await buildTwoMemberStartedLeague(browser, "outsider");
  const contextC = await browser.newContext({ locale: "es-ES" });
  const pageC = await contextC.newPage();
  try {
    await signup(pageC, uniqueEmail("flc-outsider"));
    const snap = await snapshotLeague(league.admin, league.leagueId);

    await pageC.goto(`/leagues/${league.leagueId}`);
    await expect(pageC.getByText("Liga no encontrada o sin acceso.")).toBeVisible();
    await expect(pageC.getByRole("heading", { name: league.teamAName })).not.toBeVisible();

    const detail = await pageC.request.get(`/api/leagues/${league.leagueId}`);
    expect(detail.status()).toBe(404);

    const proposals = await pageC.request.get(
      `/api/leagues/${league.leagueId}/fixtures/${snap.fixtureId}/proposals`,
    );
    expect(proposals.status()).toBe(404);

    const result = await pageC.request.post(
      `/api/leagues/${league.leagueId}/fixtures/${snap.fixtureId}/result`,
      { data: resultPayloadFor(snap, { homeScore: 1, awayScore: 0 }) },
    );
    expect(result.status()).toBe(404);
  } finally {
    await league.close();
    await contextC.close();
  }
});

// --- Journey 3: repeat result load / forfeit-after-result are 409, and the
// UI hides "Acta del partido" once the fixture is played ------------------------
test("repeat result load and forfeit-after-result are rejected (409); UI hides Acta del partido on played", async ({
  browser,
}) => {
  const league = await buildTwoMemberStartedLeague(browser, "repeat");
  try {
    const fixtureId = await scheduleFixture(league.admin, league.rival, league.leagueId);
    await league.admin.reload();
    await loadResultViaModal(league.admin, league.teamAName, league.teamBName, 2);
    await waitForFixtureStatus(league.admin, league.leagueId, fixtureId, "played");
    await league.admin.reload();

    const region = league.admin.getByRole("region", { name: "Jornada 1" });
    await expect(region.getByText(/Partido 1 · Jugado/)).toBeVisible();
    await expect(region.getByRole("button", { name: "Acta del partido" })).toHaveCount(0);

    const snap = await snapshotLeague(league.admin, league.leagueId);
    const repeat = await league.admin.request.post(
      `/api/leagues/${league.leagueId}/fixtures/${fixtureId}/result`,
      { data: resultPayloadFor(snap, { homeScore: 2, awayScore: 0 }) },
    );
    expect(repeat.status()).toBe(409);

    const forfeit = await league.admin.request.post(
      `/api/leagues/${league.leagueId}/fixtures/${fixtureId}/forfeit`,
      { data: { winnerTeamId: snap.homeTeamId } },
    );
    expect(forfeit.status()).toBe(409);
  } finally {
    await league.close();
  }
});

// --- Journey 4: forfeit walkover → Jugado 2–0 → round complete; result-after-
// forfeit is mutually exclusive (409) -------------------------------------------
test("forfeit walkover: admin forfeits a scheduled fixture → Jugado 2–0 → round completes; result-after-forfeit is 409", async ({
  browser,
}) => {
  const league = await buildTwoMemberStartedLeague(browser, "forfeit");
  try {
    const fixtureId = await scheduleFixture(league.admin, league.rival, league.leagueId);
    await league.admin.reload();

    const region = league.admin.getByRole("region", { name: "Jornada 1" });
    await expect(region.getByText(/Partido 1 · Programado/)).toBeVisible();

    // Admin awards the walkover to their OWN team via the `···` overflow (MAW-1).
    await league.admin.getByRole("button", { name: "Más acciones" }).first().click();
    await league.admin.getByRole("menuitem", { name: "Otorgar victoria" }).click();
    const modal = league.admin.getByRole("dialog", { name: /Otorgar victoria por no presentación/ });
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: league.teamAName, exact: true }).click();
    await modal.getByRole("button", { name: `Otorgar victoria a ${league.teamAName}` }).click();

    await expect(region.getByText(/Partido 1 · Jugado/)).toBeVisible();
    // Walkover score in the CENTER (Design B), winner highlighted via VICTORIA.
    await expect(region.getByText(/(2 : 0|0 : 2)/)).toBeVisible();
    await expect(region.getByText("VICTORIA")).toBeVisible();
    await expect(region.locator('[data-winner="true"]').getByRole("link").first()).toHaveText(league.teamAName);
    await expect(league.admin.getByText("Jornada completa")).toBeVisible();

    // result-after-forfeit is rejected (mutual exclusion).
    const snap = await snapshotLeague(league.admin, league.leagueId);
    const result = await league.admin.request.post(
      `/api/leagues/${league.leagueId}/fixtures/${fixtureId}/result`,
      { data: resultPayloadFor(snap, { homeScore: 1, awayScore: 0 }) },
    );
    expect(result.status()).toBe(409);
  } finally {
    await league.close();
  }
});

// --- Journey 5: loading the LAST fixture closes the season — the captain sees
// the champion panel and a correction is rejected (409, definitive) -------------
test("loading the final result finishes the league: champion panel shows, corrections are rejected (RAU-40)", async ({
  browser,
}) => {
  const league = await buildTwoMemberStartedLeague(browser, "captain");
  try {
    const fixtureId = await scheduleFixture(league.admin, league.rival, league.leagueId);
    await league.rival.reload();

    // Both participants see "Acta del partido" on the scheduled card.
    const region = league.rival.getByRole("region", { name: "Jornada 1" });
    await expect(region.getByRole("button", { name: "Acta del partido" })).toBeVisible();

    // The captain (rival B) loads a 1–0 win through the API — this is the
    // season's ONLY fixture, so it auto-closes the league (RAU-40).
    const snap = await snapshotLeague(league.rival, league.leagueId);
    const bTeam = snap.teams.find((t) => t.name === league.teamBName);
    const bHome = snap.homeTeamId === bTeam?.id;
    const loaded = await league.rival.request.post(
      `/api/leagues/${league.leagueId}/fixtures/${fixtureId}/result`,
      { data: resultPayloadFor(snap, { homeScore: bHome ? 1 : 0, awayScore: bHome ? 0 : 1 }) },
    );
    expect(loaded.status()).toBe(200);
    await waitForFixtureStatus(league.rival, league.leagueId, fixtureId, "played");

    // The league closed with the captain's team as the stored champion.
    const detail = await league.rival.request.get(`/api/leagues/${league.leagueId}`);
    expect(detail.status()).toBe(200);
    const body = (await detail.json()) as { status: string; championTeamId: string | null };
    expect(body.status).toBe("finished");
    expect(body.championTeamId).toBe(bTeam?.id);

    // The UI shows the champion panel + the Finalizada badge; the played card
    // stays visible but the correction affordance is gone (definitive).
    await league.rival.reload();
    await expect(league.rival.getByText("Finalizada", { exact: true })).toBeVisible();
    const championPanel = league.rival.getByTestId("champion-panel");
    await expect(championPanel).toBeVisible();
    await expect(championPanel.getByText("Campeón")).toBeVisible();
    await expect(championPanel.getByText(league.teamBName)).toBeVisible();
    await expect(region.getByText(/Partido 1 · Jugado/)).toBeVisible();
    await expect(region.getByRole("button", { name: "Más acciones" })).toHaveCount(0);
    await expect(region.getByRole("menuitem", { name: "Corregir resultado" })).toHaveCount(0);

    // The captain's PUT (correction) is rejected — the champion is definitive.
    const corrected = await league.rival.request.put(
      `/api/leagues/${league.leagueId}/fixtures/${fixtureId}/result`,
      { data: resultPayloadFor(snap, { homeScore: bHome ? 2 : 0, awayScore: bHome ? 0 : 2 }) },
    );
    expect(corrected.status()).toBe(409);
  } finally {
    await league.close();
  }
});

// --- Journey 6: unauthenticated result POST → 401 -----------------------------
test("unauthenticated result POST returns 401", async ({ browser }) => {
  const context = await browser.newContext({ locale: "es-ES" });
  try {
    const page = await context.newPage();
    const res = await page.request.post("/api/leagues/bogus/fixtures/bogus/result", {
      data: { home: {}, away: {} },
    });
    expect(res.status()).toBe(401);
  } finally {
    await context.close();
  }
});

// --- Journey 7: server rejects a result whose per-player TDs do not sum to the
// reported score (400) and leaves the fixture untouched -------------------------
test("server rejects a result whose per-player TDs do not sum to the score (400)", async ({
  browser,
}) => {
  const league = await buildTwoMemberStartedLeague(browser, "tdsum");
  try {
    const fixtureId = await scheduleFixture(league.admin, league.rival, league.leagueId);
    const snap = await snapshotLeague(league.admin, league.leagueId);

    // Home reports 1 goal but its first player records 2 TDs → mismatch.
    const bad = resultPayloadFor(snap, { homeScore: 1, awayScore: 0, homeTds: 2 });
    const rejected = await league.admin.request.post(
      `/api/leagues/${league.leagueId}/fixtures/${fixtureId}/result`,
      { data: bad },
    );
    expect(rejected.status()).toBe(400);

    // The fixture is untouched (still scheduled).
    const after = await snapshotLeague(league.admin, league.leagueId);
    expect(after.status).toBe("scheduled");
    expect(after.homeScore).toBeNull();
    expect(after.awayScore).toBeNull();
  } finally {
    await league.close();
  }
});

// --- Journey 8: a missing MVP blocks the save client-side (MAW-8) --------------
test("an acta without an MVP is blocked client-side with an alert", async ({
  browser,
}) => {
  const league = await buildTwoMemberStartedLeague(browser, "mvp");
  try {
    await scheduleFixture(league.admin, league.rival, league.leagueId);
    await league.admin.reload();

    const dialog = await openActaWizard(league.admin);

    // Step 0 · Contexto — defaults are valid.
    await nextStep(dialog);
    // Step 1 · Marcador — A 1, B 0.
    await dialog.getByLabel(league.teamAName, { exact: true }).fill("1");
    await dialog.getByLabel(league.teamBName, { exact: true }).fill("0");
    await nextStep(dialog);
    // Step 2 · Acciones — A's Player 1 scores the only TD (Σ == marcador).
    await addActionLine(dialog, league.teamAName, 1, {
      player: "Player 1",
      kind: "td",
      quantity: 1,
    });
    await nextStep(dialog);
    // Step 3 · MVP — select ONLY team A's MVP; team B is left without one.
    await selectMvp(dialog, league.teamAName, "Player 1");
    await nextStep(dialog);
    // Step 4 · Bajas and Step 5 · Final — advance.
    await nextStep(dialog);
    await nextStep(dialog);

    // Step 6 · Revisar — the MAW-8 save-block refuses: the summary shows the
    // missing-MVP alert and the save button is disabled.
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog.getByRole("alert")).toHaveText(
      new RegExp(`Falta el MVP de ${league.teamBName}`),
    );
    await expect(dialog.getByRole("button", { name: "Guardar acta" })).toBeDisabled();

    // Nothing is persisted.
    const after = await snapshotLeague(league.admin, league.leagueId);
    expect(after.status).toBe("scheduled");
  } finally {
    await league.close();
  }
});
