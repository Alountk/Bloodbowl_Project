import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * Real-DB league-matchday E2E journeys (run via `pnpm run test:e2e:auth` with
 * AUTH_MODE=auth and a running Postgres). This is PR3 of the matchday chain and
 * exercises the full multi-user journeys that the component/route layers
 * already prove in isolation:
 *
 * 1. Negotiation (matchday-negotiation): two fixture participants reach an
 *    agreement — the first participant proposes a date, the second counter-
 *    proposes, and the first accepts → the fixture derives `scheduled` and the
 *    card shows "Programado" with the agreed date+time. A third member who does
 *    NOT play this fixture sees the same history READ-ONLY (no Proponer /
 *    Aceptar controls). A second negotiation journey proves the league owner may
 *    drive the negotiation when their team plays (owner-participant).
 *
 * 2. Forfeit + completion (matchday-forfeit): the league owner awards a walkover
 *    via the forfeit modal → the card shows "Jugado" with the winner highlighted
 *    (VICTORIA chip) and the single round becomes "Jornada completa". A non-admin
 *    member receives 403 on the forfeit API.
 *
 * 3. Scouting (team-scouting): a member opens a rival team's detail page and
 *    sees the roster read-only (no mutation affordances); an outsider navigating
 *    to the same team detail gets the 404 boundary.
 *
 * The round-robin start route SHUFFLES team ids, so with an odd team count the
 * single round-1 fixture pairs two arbitrary members and the third sits out each
 * round. The journeys therefore DISCOVER the two participants (and the
 * non-participant) from the match card instead of hard-coding which member plays,
 * keeping the assertions deterministic across runs.
 *
 * Each test creates it own unique users/teams/league per run (unique emails and
 * names), so the persisted Postgres never collides and the suite is idempotent.
 */

const PASSWORD = "password-123";
const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

// The journeys each re-run a full 3-user, 3-team, real-Postgres setup, which
// exceeds Playwright's default 30s per-test budget (3 bcrypt signups + 3×11
// player interactions + league joins + season start). Give them room.
test.setTimeout(180_000);

/** Signs up and lands on the home page with an active session. */
async function signup(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).last().click();
  await expect(page).toHaveURL("/");
}

/** Creates a human team of `playerCount` (default 11, the BB2025 minimum). */
async function createTeam(page: Page, name: string, playerCount = 11) {
  await page.goto("/teams/create");
  await page.getByLabel("Team name").fill(name);
  await page.getByLabel("Race").selectOption("human");
  await page.getByRole("button", { name: /siguiente/i }).click();
  const add = page.getByRole("button", { name: "Add Lineman" }).first();
  for (let i = 0; i < playerCount; i++) await add.click();
  await page.getByRole("button", { name: /create team/i }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText(name)).toBeVisible();
}

async function createLeague(page: Page, name: string) {
  await page.goto("/leagues");
  await expect(page.getByRole("heading", { name: "Mis Ligas" })).toBeVisible();
  await page.getByRole("button", { name: "+ Nueva liga" }).first().click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Descripción").fill("Liga de matchday e2e");
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

/** Builds a unique slot (local time) plus its es-ES label for assertions. */
function futureSlot(
  daysAhead: number,
  hours: number,
  minutes: number,
): { dateInput: string; esLabel: string; esRegex: RegExp } {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hours, minutes, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const esLabel = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return {
    dateInput: `${y}-${m}-${day}`,
    esLabel,
    esRegex: new RegExp(`${day}/${m}/${y}, ${hh}:${mm}`),
  };
}

/** Reads the two fixture team names shown on the round's match card. */
async function fixturesTeamNames(page: Page, round = 1): Promise<string[]> {
  const region = page.getByRole("region", { name: `Jornada ${round}` });
  const links = region.getByRole("link");
  const count = await links.count();
  expect(count).toBeGreaterThanOrEqual(2);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = (await links.nth(i).textContent())?.trim() ?? "";
    if (text) names.push(text);
  }
  return names;
}

async function openNegotiation(page: Page, round = 1) {
  // Tourplay card: the CENTER SCORE is the clickable negotiation target (the
  // old "VS" glyph was replaced by the scorebox — deliberate Design-B update).
  await page.getByRole("region", { name: `Jornada ${round}` }).getByTestId("match-card-score").click();
}

const negotiationDialog = (page: Page) =>
  page.getByRole("dialog", { name: /Acordar fecha/ });

/** Proposes a date+time from an open negotiation dialog. */
async function proposeInDialog(page: Page, dateInput: string, timeInput: string) {
  const dialog = negotiationDialog(page);
  await dialog.getByLabel("Fecha propuesta").fill(dateInput);
  await dialog.getByLabel("Hora propuesta").fill(timeInput);
  await dialog.getByRole("button", { name: "Proponer" }).click();
}

/** Resolves the first fixture id of a started league via the caller's session. */
async function fixtureIdOf(page: Page, leagueId: string): Promise<string> {
  const res = await page.request.get(`/api/leagues/${leagueId}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { fixtures: { id: string }[] };
  expect(body.fixtures.length).toBeGreaterThanOrEqual(1);
  return body.fixtures[0].id;
}

/** Number of open (unaccepted, unclosed) proposals on a fixture. */
async function activeProposalCount(
  page: Page,
  leagueId: string,
  fixtureId: string,
): Promise<number> {
  const res = await page.request.get(
    `/api/leagues/${leagueId}/fixtures/${fixtureId}/proposals`,
  );
  if (res.status() !== 200) return -1;
  const ps = (await res.json()) as { acceptedAt: string | null; closedAt: string | null }[];
  return ps.filter((p) => p.acceptedAt === null && p.closedAt === null).length;
}

/**
 * The propose/accept POSTs run asynchronously after the form submit (the test
 * click returns before the route call resolves), and each member's page holds a
 * snapshot of the detail. Poll the participant-visible proposals API until the
 * mutation is committed so the NEXT member's reload sees it — deterministic.
 */
async function waitForActive(
  page: Page,
  leagueId: string,
  fixtureId: string,
  expected: number,
) {
  await expect
    .poll(() => activeProposalCount(page, leagueId, fixtureId), {
      timeout: 15_000,
    })
    .toBe(expected);
}

async function waitForFixtureStatus(page: Page, leagueId: string, fixtureId: string, status: string) {
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/leagues/${leagueId}`);
        if (res.status() !== 200) return null;
        const body = (await res.json()) as {
          fixtures: { id: string; status?: string }[];
        };
        return body.fixtures.find((f) => f.id === fixtureId)?.status ?? null;
      },
      { timeout: 15_000 },
    )
    .toBe(status);
}

/** Contexts + pages for a started 3-member league. Closed by the caller. */
interface StartedLeague {
  pages: Record<string, Page>;
  /** Maps a member team name → its owner page. */
  pageOfTeam: Map<string, Page>;
  leagueUrl: string;
  leagueId: string;
  teamNames: string[];
  close: () => Promise<void>;
}

/**
 * Builds one started 3-member league (admin A + rivals B, C), each owning an
 * 11-player team, with a 1-jornada season (odd team count → one fixture with
 * one bye per round). Callers can constrain the round-1 pairing with:
 * - opts.adminAsBye: the round's fixture must pair two NON-ADMIN members (the
 *   admin is the non-participant and stays read-only in the negotiation panel);
 * - opts.adminPlays: the round's fixture must INCLUDE the admin's team (the
 *   owner-participant negotiates with the other participant).
 * Called repeatedly by `setupStartedLeague` (which bumps the `tag` per attempt)
 * until the constraint holds; the round-robin start shuffles team ids, so
 * `adminPlays` holds ~2/3 and `adminAsBye` ~1/3 of the time per attempt.
 */
interface SetupOptions {
  adminAsBye?: boolean;
  adminPlays?: boolean;
}

async function buildOneStartedLeague(
  browser: Browser,
  tag: string,
  opts: SetupOptions,
): Promise<StartedLeague> {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const contextC = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const pageC = await contextC.newPage();

  const close = async () => {
    await contextA.close();
    await contextB.close();
    await contextC.close();
  };

  try {
    // Admin A: signup + team + league, and A joins with their own team.
    const emailA = uniqueEmail(`admin-${tag}`);
    await signup(pageA, emailA);
    const teamAName = `A-${tag} ${Date.now()}`;
    await createTeam(pageA, teamAName);
    const leagueName = `Liga ${tag} ${Date.now()}`;
    await createLeague(pageA, leagueName);
    const leagueUrl = await openLeagueCard(pageA, leagueName);
    const leagueId = /\/leagues\/(.+)$/.exec(leagueUrl)?.[1];
    expect(leagueId).toBeDefined();
    await pageA.getByLabel("Tu equipo").selectOption({ label: teamAName });
    await pageA.getByRole("button", { name: "Apuntarse" }).click();
    await expect(pageA.getByText(teamAName)).toBeVisible();

    // B: signup + team → join A's OPEN league.
    const emailB = uniqueEmail(`rival-${tag}`);
    await signup(pageB, emailB);
    const teamBName = `B-${tag} ${Date.now()}`;
    await createTeam(pageB, teamBName);
    await pageB.goto("/leagues");
    await openLeagueCard(pageB, leagueName);
    await pageB.getByLabel("Tu equipo").selectOption({ label: teamBName });
    await pageB.getByRole("button", { name: "Apuntarse" }).click();
    await expect(pageB.getByText(teamBName)).toBeVisible();

    // C: signup + team → join too (three members, odd count).
    const emailC = uniqueEmail(`member-${tag}`);
    await signup(pageC, emailC);
    const teamCName = `C-${tag} ${Date.now()}`;
    await createTeam(pageC, teamCName);
    await pageC.goto("/leagues");
    await openLeagueCard(pageC, leagueName);
    await pageC.getByLabel("Tu equipo").selectOption({ label: teamCName });
    await pageC.getByRole("button", { name: "Apuntarse" }).click();
    await expect(pageC.getByText(teamCName)).toBeVisible();

    // A starts the season with 1 jornada.
    await pageA.reload();
    await expect(pageA.getByRole("heading", { name: leagueName })).toBeVisible();
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
    await expect(pageA.getByRole("region", { name: "Jornada 1" })).toBeVisible();

    // Every member page must be on the STARTED jornada before the caller drives
    // negotiation/scouting — B and C last saw the OPEN detail, so reload them.
    for (const p of [pageB, pageC]) {
      await p.reload();
      await expect(p.getByText("Iniciada")).toBeVisible();
      await expect(p.getByRole("region", { name: "Jornada 1" })).toBeVisible();
    }

    const teamNames = [teamAName, teamBName, teamCName];
    const pageOfTeam = new Map<string, Page>([
      [teamAName, pageA],
      [teamBName, pageB],
      [teamCName, pageC],
    ]);

    // Constraint guard: when the caller needs the admin as the non-participant,
    // the round's fixture must NOT include the admin's team. The round-1 pairing
    // is shuffled, so retry whenever the admin appears on EITHER side (previously
    // only the first team was checked, letting an admin-as-second-team league
    // leak through and fail the caller's `not.toContain(admin)` assertion).
    if (opts.adminAsBye) {
      const [t1, t2] = await fixturesTeamNames(pageA);
      if (t1 === teamAName || t2 === teamAName) {
        await close();
        return null as unknown as StartedLeague;
      }
    }

    // Constraint guard: when the caller needs the ADMIN to be a fixture
    // participant (owner-participant journey), the round's fixture MUST include
    // the admin's team; when the admin is the round-1 bye, retry.
    if (opts.adminPlays) {
      const [t1, t2] = await fixturesTeamNames(pageA);
      if (t1 !== teamAName && t2 !== teamAName) {
        await close();
        return null as unknown as StartedLeague;
      }
    }

    return {
      pages: { a: pageA, b: pageB, c: pageC },
      pageOfTeam,
      leagueUrl,
      leagueId: leagueId as string,
      teamNames,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

/** Sets up a started 3-member league, retrying with fresh unique data until the
 * requested pairing constraint (`adminAsBye` / `adminPlays`) is satisfied. */
async function setupStartedLeague(
  browser: Browser,
  tag: string,
  opts: SetupOptions = {},
): Promise<StartedLeague> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = attempt === 0 ? tag : `${tag}-r${attempt}`;
    const built = await buildOneStartedLeague(browser, suffix, opts);
    if (built) return built;
  }
  throw new Error(
    `setupStartedLeague("${tag}"): could not satisfy the pairing constraints after 8 attempts`,
  );
}

// --- Journey 1: Negotiation (matchday-negotiation) ---------------------------
test("negotiation: participants propose/counter/accept, non-participant member sees read-only history", async ({
  browser,
}) => {
  // The league owner is read-only in the negotiation panel only when they do NOT
  // play the fixture (participant rule), so this journey pairs the two NON-ADMIN
  // members and asserts the admin (a non-participant) still sees read-only
  // history. `adminAsBye` retries the start until the admin's team is the bye.
  const league = await setupStartedLeague(browser, "nego", { adminAsBye: true });
  try {
    // The admin's team must be the non-participant this round.
    const adminTeamName = league.teamNames[0];
    const [t1, t2] = await fixturesTeamNames(league.pages.a);
    expect([t1, t2]).not.toContain(adminTeamName);
    const outsider = league.pageOfTeam.get(adminTeamName)!;
    const proposer = league.pageOfTeam.get(t1)!;
    const counter = league.pageOfTeam.get(t2)!;
    expect(proposer).not.toBe(counter);

    // 1) Proposer proposes a date+time; wait until the proposal is committed.
    const fixtureId = await fixtureIdOf(proposer, league.leagueId);
    const slot1 = futureSlot(10, 18, 0);
    await openNegotiation(proposer);
    await expect(negotiationDialog(proposer)).toBeVisible();
    await proposeInDialog(proposer, slot1.dateInput, "18:00");
    await waitForActive(proposer, league.leagueId, fixtureId, 1);

    // 2) Counter reloads (to pick up the proposer's committed proposal) and
    //    counter-proposes.
    await counter.reload();
    await openNegotiation(counter);
    await expect(negotiationDialog(counter)).toBeVisible();
    await expect(negotiationDialog(counter).getByText(slot1.esLabel)).toBeVisible();
    const slot2 = futureSlot(12, 20, 30);
    await proposeInDialog(counter, slot2.dateInput, "20:30");
    await waitForActive(counter, league.leagueId, fixtureId, 1);

    // 3) Proposer reloads, sees the counter's active proposal and accepts it.
    await proposer.reload();
    await openNegotiation(proposer);
    await expect(negotiationDialog(proposer)).toBeVisible();
    await expect(negotiationDialog(proposer).getByText(slot2.esLabel)).toBeVisible();
    await negotiationDialog(proposer).getByRole("button", { name: "Aceptar" }).click();
    await waitForFixtureStatus(proposer, league.leagueId, fixtureId, "scheduled");

    // The fixture derives scheduled: the card header shows "Programado" and the
    // footer shows the agreed date+time (the counter's accepted slot).
    const region = proposer.getByRole("region", { name: "Jornada 1" });
    await expect(region.getByText(/Partido 1 · Programado/)).toBeVisible();
    await expect(region.getByText(slot2.esRegex)).toBeVisible();

    // 4) The non-participant member reloads and sees the SAME history read-only:
    //    the accepted proposal is visible but there are NO propose/accept controls.
    await outsider.reload();
    await openNegotiation(outsider);
    const readOnly = negotiationDialog(outsider);
    await expect(readOnly).toBeVisible();
    await expect(readOnly.getByText("✓ Acordado")).toBeVisible();
    await expect(readOnly.getByText(slot2.esLabel)).toBeVisible();
    await expect(readOnly.getByRole("button", { name: /Proponer/ })).not.toBeVisible();
    await expect(readOnly.getByRole("button", { name: /Aceptar/ })).not.toBeVisible();
  } finally {
    await league.close();
  }
});

// --- Journey 3b: Rejornar — re-negotiate a scheduled fixture before play ------
test("rejornar: a participant re-opens negotiation on a scheduled fixture and a new accept updates the date", async ({
  browser,
}) => {
  const league = await setupStartedLeague(browser, "rejar");
  try {
    const [t1, t2] = await fixturesTeamNames(league.pages.a);
    const proposer = league.pageOfTeam.get(t1)!;
    const accepter = league.pageOfTeam.get(t2)!;
    expect(proposer).not.toBe(accepter);
    const fixtureId = await fixtureIdOf(proposer, league.leagueId);

    // 1) First schedule: a participant proposes and the other accepts (existing flow).
    const slot1 = futureSlot(10, 18, 0);
    await openNegotiation(proposer);
    await expect(negotiationDialog(proposer)).toBeVisible();
    await proposeInDialog(proposer, slot1.dateInput, "18:00");
    await waitForActive(proposer, league.leagueId, fixtureId, 1);

    await accepter.reload();
    await openNegotiation(accepter);
    await expect(negotiationDialog(accepter)).toBeVisible();
    await negotiationDialog(accepter).getByRole("button", { name: "Aceptar" }).click();
    await waitForFixtureStatus(accepter, league.leagueId, fixtureId, "scheduled");
    // Proposer reloads to pick up the accepted status; the card now shows the
    // first agreed date.
    await proposer.reload();
    const region = proposer.getByRole("region", { name: "Jornada 1" });
    await expect(proposer.getByText(/Partido 1 · Programado/).first()).toBeVisible();
    await expect(region.getByText(slot1.esRegex)).toBeVisible();

    // 2) Rejornar: a participant re-opens negotiation on the SCHEDULED fixture and
    //    proposes a NEW date (the panel is available pre-play for scheduled).
    const slot2 = futureSlot(17, 20, 30);
    await proposer.reload();
    await openNegotiation(proposer);
    await expect(negotiationDialog(proposer)).toBeVisible();
    await expect(negotiationDialog(proposer).getByText(/Re-programar/)).toBeVisible();
    await proposeInDialog(proposer, slot2.dateInput, "20:30");
    await waitForActive(proposer, league.leagueId, fixtureId, 1);

    // 3) The other participant accepts the re-negotiation → scheduledAt updates.
    await accepter.reload();
    await openNegotiation(accepter);
    await expect(negotiationDialog(accepter)).toBeVisible();
    await expect(negotiationDialog(accepter).getByText(slot2.esLabel)).toBeVisible();
    await negotiationDialog(accepter).getByRole("button", { name: "Aceptar" }).click();
    await waitForFixtureStatus(accepter, league.leagueId, fixtureId, "scheduled");

    // 4) The card shows the NEW date (history kept the old cycles, intact).
    await proposer.reload();
    const regionAfter = proposer.getByRole("region", { name: "Jornada 1" });
    await expect(proposer.getByText(/Partido 1 · Programado/).first()).toBeVisible();
    await expect(regionAfter.getByText(slot2.esRegex)).toBeVisible();
    await openNegotiation(proposer);
    const history = negotiationDialog(proposer);
    await expect(history).toBeVisible();
    // History retains the old agreed proposal alongside the new schedule.
    await expect(history.getByText(slot1.esLabel)).toBeVisible();
  } finally {
    await league.close();
  }
});

// --- Journey 4: Owner participant negotiates (matchday-negotiation) ----------
test("negotiation: the league owner whose team plays proposes and the other participant accepts", async ({
  browser,
}) => {
  // The participant rule lets a league owner negotiate when they own one of the
  // fixture's teams (spec: "Owner participant negotiates"). `adminPlays` retries
  // the start until the admin's team is one of the round-1 fixture participants.
  const league = await setupStartedLeague(browser, "owner-nego", { adminPlays: true });
  try {
    const adminTeamName = league.teamNames[0];
    const [t1, t2] = await fixturesTeamNames(league.pages.a);
    expect([t1, t2]).toContain(adminTeamName);
    const admin = league.pages.a;

    // The admin (owner-participant) proposes a date+time from the negotiation panel.
    const fixtureId = await fixtureIdOf(admin, league.leagueId);
    const slot = futureSlot(14, 17, 30);
    await openNegotiation(admin);
    await expect(negotiationDialog(admin)).toBeVisible();
    await proposeInDialog(admin, slot.dateInput, "17:30");
    await waitForActive(admin, league.leagueId, fixtureId, 1);

    // The other participant reloads, sees the owner's proposal and accepts it.
    const otherName = t1 === adminTeamName ? t2 : t1;
    const other = league.pageOfTeam.get(otherName)!;
    await other.reload();
    await openNegotiation(other);
    await expect(negotiationDialog(other)).toBeVisible();
    await expect(negotiationDialog(other).getByText(slot.esLabel)).toBeVisible();
    await negotiationDialog(other).getByRole("button", { name: "Aceptar" }).click();
    await waitForFixtureStatus(other, league.leagueId, fixtureId, "scheduled");

    // The fixture derives scheduled on the other participant's card.
    const region = other.getByRole("region", { name: "Jornada 1" });
    await expect(region.getByText(/Partido 1 · Programado/)).toBeVisible();
    await expect(region.getByText(slot.esRegex)).toBeVisible();
  } finally {
    await league.close();
  }
});

// --- Journey 2: Forfeit + round completion (matchday-forfeit) ----------------
test("forfeit: admin awards a walkover → played + Jornada completa; non-admin forfeit is 403", async ({
  browser,
}) => {
  const league = await setupStartedLeague(browser, "forfeit");
  try {
    const [t1, t2] = await fixturesTeamNames(league.pages.a);
    expect(t1).toBeDefined();
    expect(t2).toBeDefined();
    const admin = league.pages.a;

    // Non-admin (a member who is not the league owner) POSTs forfeit → 403.
    const member = league.pageOfTeam.get(t2 === league.teamNames[0] ? t1 : t2)!;
    const detail = await member.request.get(`/api/leagues/${league.leagueId}`);
    expect(detail.status()).toBe(200);
    const fixture = ((await detail.json()) as { fixtures: { id: string; homeTeamId: string }[] })
      .fixtures[0];
    const forbidden = await member.request.post(
      `/api/leagues/${league.leagueId}/fixtures/${fixture.id}/forfeit`,
      { data: { winnerTeamId: fixture.homeTeamId } },
    );
    expect(forbidden.status()).toBe(403);

    // Admin awards the walkover to t1 via the forfeit modal.
    await admin
      .getByRole("region", { name: "Jornada 1" })
      .getByRole("button", { name: "Otorgar victoria" })
      .click();
    const modal = admin.getByRole("dialog", { name: /Otorgar victoria por no presentación/ });
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: t1, exact: true }).click();
    await modal.getByRole("button", { name: `Otorgar victoria a ${t1}` }).click();

    // Card shows "Jugado" with the winner highlighted (the winner's team column
    // carries data-winner + the VICTORIA chip), and the round is complete (the
    // badge lives in the round header, above the cards' `region`, so scope to
    // the page).
    const region = admin.getByRole("region", { name: "Jornada 1" });
    await expect(region.getByText(/Partido 1 · Jugado/)).toBeVisible();
    await expect(region.getByText("VICTORIA")).toBeVisible();
    await expect(region.locator('[data-winner="true"]').getByRole("link").first()).toHaveText(t1);
    await expect(admin.getByText("Jornada completa")).toBeVisible();
  } finally {
    await league.close();
  }
});

// --- Journey 3: Scouting (team-scouting) -------------------------------------
test("scouting: a member views a rival's roster read-only; an outsider gets a 404", async ({
  browser,
}) => {
  const league = await setupStartedLeague(browser, "scout");
  try {
    const admin = league.pages.a;
    const member = league.pages.b;

    // Resolve the admin's team id from the league detail (member teams list).
    const detail = await member.request.get(`/api/leagues/${league.leagueId}`);
    expect(detail.status()).toBe(200);
    const body = (await detail.json()) as {
      teams: { id: string; name: string }[];
    };
    const adminTeam = body.teams.find((t) => t.name === league.teamNames[0]);
    expect(adminTeam).toBeDefined();
    const adminTeamHref = `/teams/${adminTeam!.id}`;

    // A member (B) opens the admin's team detail: read-only roster, no mutation
    // affordances (the shared TeamDetailView renders the roster read-only).
    await member.goto(adminTeamHref);
    await expect(
      member.getByRole("heading", { name: new RegExp(league.teamNames[0]) }),
    ).toBeVisible();
    await expect(member.getByRole("heading", { name: "Plantilla" })).toBeVisible();
    await expect(
      member.getByRole("button", { name: /eliminar|renombrar|editar|delete/i }),
    ).toHaveCount(0);

    // An outsider (D, not a member) navigating to the same team gets the 404
    // boundary (scouting GET returns 404 → notFound()).
    void admin;
    const contextD = await browser.newContext();
    try {
      const pageD = await contextD.newPage();
      await signup(pageD, uniqueEmail("outsider-scout"));
      await pageD.goto(adminTeamHref);
      await expect(pageD.getByText("Team not found")).toBeVisible();
      await expect(pageD.getByRole("heading", { name: /Plantilla/ })).not.toBeVisible();
      await expect(pageD.getByText(league.teamNames[0])).not.toBeVisible();
    } finally {
      await contextD.close();
    }
  } finally {
    await league.close();
  }
});
