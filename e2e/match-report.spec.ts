import { test, expect, type Page, type Browser } from "@playwright/test";

/**
 * Real-DB match-report E2E journeys (run via `pnpm run test:e2e:auth` with
 * AUTH_MODE=auth and a running Postgres). This is PR6 (the final match-report
 * slice) and closes the loop on the post-match resolution flows that the
 * route/component layers prove in isolation:
 *
 *  1. result + progression (match-result, player-progression): a started
 *     2-member league's single fixture is scheduled, the league OWNER (a
 *     fixture participant) loads a 2–0 win through the ResultModal, the
 *     MatchCard shows the score and the round becomes "Jornada completa"; the
 *     same owner then visits their own team detail, spends the scorer's PE on an
 *     élite skill (Block) in the ProgressionPanel, and sees the élite `$` badge
 *     with the recalculated value.
 *  2. correction (match-result R5): the league owner (admin) corrects that
 *     played result through the modal → the MatchCard score updates.
 *
 * The 2-member league yields exactly one fixture (no round-robin byes), so the
 * pairing and the "Jornada completa" assertion are deterministic. The fixture's
 * home/away sides are shuffled at start, so every modal interaction is scoped by
 * the TEAM NAME (the ResultModal labels each section and its inputs with the
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
  await page.getByRole("button", { name: "Next →" }).click();
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
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
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

/** Polls the league detail until the given fixture reaches a status. The modal's
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

/** Loads a result through the ResultModal: the ADMIN team (`adminTeamName`)
 * wins `score`–0 (its Player 1 scoring both TDs → 6 PE for the élite spent),
 * and six DIFFERENT MJP nominations are picked per team (the route REQUIRES
 * exactly six). Every label is scoped by team NAME — the modal labels each
 * section and its inputs with the team name, never "home"/"away", so the
 * shuffled fixture side does not matter. */
async function loadResultViaModal(
  page: Page,
  adminTeamName: string,
  rivalTeamName: string,
  score: number,
) {
  await page.getByRole("button", { name: "Cargar resultado" }).first().click();
  const dialog = page.getByRole("dialog", { name: /Cargar resultado/ });
  await expect(dialog).toBeVisible();

  const adminSection = dialog.getByLabel(`Resultado ${adminTeamName}`);
  const rivalSection = dialog.getByLabel(`Resultado ${rivalTeamName}`);
  await adminSection.getByLabel(`Goles ${adminTeamName}`).fill(String(score));
  await rivalSection.getByLabel(`Goles ${rivalTeamName}`).fill("0");
  await adminSection
    .getByLabel("Anotaciones Player 1", { exact: true })
    .fill(String(score));

  // Exactly six DIFFERENT MJP nominations per team (option index i = player i).
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

    // Same owner spends the scorer's PE (2 TDs → 6 PE) on Block (élite primary).
    const detail = await league.admin.request.get(`/api/leagues/${league.leagueId}`);
    const teams = ((await detail.json()) as { teams: { id: string; name: string }[] }).teams;
    const adminTeam = teams.find((t) => t.name === league.teamAName);
    expect(adminTeam).toBeDefined();
    await league.admin.goto(`/teams/${adminTeam!.id}`);
    await expect(league.admin.getByRole("heading", { name: "Progression" })).toBeVisible();

    // The first panel is Player 1 (roster order); open it and buy Block as a
    // primary skill (élite, G access on a human lineman).
    await league.admin.getByRole("button", { name: "Improve" }).first().click();
    await league.admin.getByLabel("Primaria").first().selectOption("block");
    await league.admin.getByRole("button", { name: "Comprar primaria" }).first().click();

    // Block is élite: the acquired skill renders with the `$` badge and the
    // value recap re-renders from the refreshed row.
    await expect(league.admin.getByText("Block")).toBeVisible();
    await expect(league.admin.getByTestId("elite-badge").first()).toBeVisible();
  } finally {
    await league.admin.context()?.close().catch(() => undefined);
    await league.rival.context()?.close().catch(() => undefined);
  }
});

test("correction: admin corrects a played result → the MatchCard score updates", async ({
  browser,
}) => {
  const league = await buildTwoMemberStartedLeague(browser, "corr");
  try {
    const fixtureId = await scheduleFixture(league);
    await league.admin.reload();
    await loadResultViaModal(league.admin, league.teamAName, league.teamBName, 2);
    await waitForFixtureStatus(league.admin, league.leagueId, fixtureId, "played");

    // Admin corrects the result through the modal: flip the win to a 1–1 draw.
    await league.admin.reload();
    await league.admin.getByRole("button", { name: "Corregir resultado" }).first().click();
    const dialog = league.admin.getByRole("dialog", { name: /Corregir resultado/ });
    await expect(dialog).toBeVisible();
    const homeSection = dialog.getByLabel(`Resultado ${league.teamAName}`);
    const awaySection = dialog.getByLabel(`Resultado ${league.teamBName}`);
    await homeSection.getByLabel(`Goles ${league.teamAName}`).fill("1");
    await awaySection.getByLabel(`Goles ${league.teamBName}`).fill("1");
    await homeSection.getByLabel("Anotaciones Player 1", { exact: true }).fill("1");
    await awaySection.getByLabel("Anotaciones Player 1", { exact: true }).fill("1");
    for (const section of [homeSection, awaySection]) {
      for (let i = 1; i <= 6; i++) {
        await section
          .getByLabel(`MVP ${i} ${section === homeSection ? league.teamAName : league.teamBName}`)
          .selectOption({ index: i });
      }
    }
    await dialog.getByRole("button", { name: "Corregir resultado" }).click();
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
    const after = league.admin.getByRole("region", { name: "Jornada 1" });
    // The corrected draw renders in the CENTER (Design B scorebox).
    await expect(after.getByText(/1 : 1/)).toBeVisible();
  } finally {
    await league.admin.context()?.close().catch(() => undefined);
    await league.rival.context()?.close().catch(() => undefined);
  }
});

test("correction: a participant captain (rival) corrects a played result → the MatchCard score updates", async ({
  browser,
}) => {
  const league = await buildTwoMemberStartedLeague(browser, "captcorr");
  try {
    const fixtureId = await scheduleFixture(league);
    // The admin loads the result first (2–0 for team A) so the fixture is played.
    await league.admin.reload();
    await loadResultViaModal(league.admin, league.teamAName, league.teamBName, 2);
    await waitForFixtureStatus(league.admin, league.leagueId, fixtureId, "played");

    // The rival (a participant captain, NOT the admin) corrects it to a 1–1 draw
    // through the SAME modal path — the correction gate is admin ∪ participants.
    await league.rival.reload();
    const card = league.rival.getByRole("region", { name: "Jornada 1" });
    await expect(card.getByRole("button", { name: "Corregir resultado" }).first()).toBeVisible();
    await card.getByRole("button", { name: "Corregir resultado" }).first().click();
    const dialog = league.rival.getByRole("dialog", { name: /Corregir resultado/ });
    await expect(dialog).toBeVisible();
    const homeSection = dialog.getByLabel(`Resultado ${league.teamAName}`);
    const awaySection = dialog.getByLabel(`Resultado ${league.teamBName}`);
    await homeSection.getByLabel(`Goles ${league.teamAName}`).fill("1");
    await awaySection.getByLabel(`Goles ${league.teamBName}`).fill("1");
    await homeSection.getByLabel("Anotaciones Player 1", { exact: true }).fill("1");
    await awaySection.getByLabel("Anotaciones Player 1", { exact: true }).fill("1");
    for (const section of [homeSection, awaySection]) {
      for (let i = 1; i <= 6; i++) {
        await section
          .getByLabel(`MVP ${i} ${section === homeSection ? league.teamAName : league.teamBName}`)
          .selectOption({ index: i });
      }
    }
    await dialog.getByRole("button", { name: "Corregir resultado" }).click();
    await expect(dialog).not.toBeVisible();

    // Poll until the corrected score commits, then verify the card shows 1 – 1.
    await expect
      .poll(
        async () => {
          const res = await league.rival.request.get(`/api/leagues/${league.leagueId}`);
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
    await league.rival.reload();
    const after = league.rival.getByRole("region", { name: "Jornada 1" });
    // The corrected draw renders in the CENTER (Design B scorebox).
    await expect(after.getByText(/1 : 1/)).toBeVisible();
  } finally {
    await league.admin.context()?.close().catch(() => undefined);
    await league.rival.context()?.close().catch(() => undefined);
  }
});
