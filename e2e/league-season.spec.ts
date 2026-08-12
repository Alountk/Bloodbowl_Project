import { test, expect, type Page } from "@playwright/test";

/**
 * Real-DB league-season E2E (run via `pnpm run test:e2e:auth` with AUTH_MODE=auth
 * and a running Postgres). Exercises the full multi-user journey from the
 * league-season spec:
 *
 *   User A (admin): signup → create team (11) → create league.
 *   User B      : signup → create team (11) → sees A's OPEN league under
 *                 "Ligas abiertas" → joins with B's own team.
 *   A           : detail shows 2 members → "Iniciar liga" is enabled → opens the
 *                 start modal → picks seasonLength 1 (teams-1 = 1) → the league
 *                 is started and the jornadas render a single round with the
 *                 single A-team vs B-team matchup.
 *   Post-start : B can no longer self-leave (controls hidden), and a foreign
 *                 user C (non-member) receives a 404 on the started detail.
 *
 * Each user runs in its own Playwright browser context, which isolates sessions
 * (storage state) — three independent logged-in sessions share the same DB.
 * All names/emails are unique per run so the persisted Postgres never collides.
 */

const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
const PASSWORD = "password-123";

async function signup(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).last().click();
  await expect(page).toHaveURL("/");
}

/** Creates a human team of the given size (default 11, the BB2025 minimum). */
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
  await page.getByLabel("Descripción").fill("Liga de verano multi-jugador");
  await page.getByRole("button", { name: "Crear liga" }).click();
  await expect(page.getByText(name)).toBeVisible();
}

/** Opens the league card named `leagueName` and returns its detail URL. */
async function openLeagueCard(page: Page, leagueName: string) {
  await page
    .locator("li")
    .filter({ hasText: leagueName })
    .getByRole("link", { name: "Ver", exact: true })
    .click();
  await expect(page).toHaveURL(/\/leagues\/.+$/);
  return page.url();
}

test("multi-user journey: join open league, start season, jornadas, post-start locks", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const contextC = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const pageC = await contextC.newPage();

  try {
    // --- User A (admin): signup, team (11), league ---
    const emailA = uniqueEmail("admin");
    await signup(pageA, emailA);
    const teamAName = `A-Titanes ${Date.now()}`;
    await createTeam(pageA, teamAName);
    const leagueName = `Liga Multi ${Date.now()}`;
    await createLeague(pageA, leagueName);
    const leagueUrl = await openLeagueCard(pageA, leagueName);
    const leagueId = /\/leagues\/(.+)$/.exec(leagueUrl)?.[1];
    expect(leagueId).toBeDefined();

    // A (owner, not yet a member) joins with their own team so the season can
    // start — a single-owner league needs the admin's own team among the ≥2.
    await pageA.getByLabel("Tu equipo").selectOption({ label: teamAName });
    await pageA.getByRole("button", { name: "Apuntarse" }).click();
    await expect(pageA.getByText(teamAName)).toBeVisible();

    // --- User B: signup, team (11), sees A's OPEN league, joins ---
    const emailB = uniqueEmail("rival");
    await signup(pageB, emailB);
    const teamBName = `B-Crudos ${Date.now()}`;
    await createTeam(pageB, teamBName);

    await pageB.goto("/leagues");
    await expect(pageB.getByRole("heading", { name: "Mis Ligas" })).toBeVisible();
    // B's open-leagues section lists A's OPEN league.
    await expect(
      pageB.getByRole("heading", { name: "Ligas abiertas" }),
    ).toBeVisible();
    await expect(
      pageB.locator("section").filter({ hasText: "Ligas abiertas" }).getByText(leagueName),
    ).toBeVisible();

    // B joins with their own team.
    await openLeagueCard(pageB, leagueName);
    await pageB.getByLabel("Tu equipo").selectOption({ label: teamBName });
    await pageB.getByRole("button", { name: "Apuntarse" }).click();
    await expect(pageB.getByText(teamBName)).toBeVisible();

    // --- A: reload the detail; now 2 members, "Iniciar liga" enabled ---
    await pageA.reload();
    await expect(pageA.getByRole("heading", { name: leagueName })).toBeVisible();
    // Detail hero shows member count "2 equipos" and both member names.
    await expect(pageA.getByText(teamAName)).toBeVisible();
    await expect(pageA.getByText(teamBName)).toBeVisible();
    const startButton = pageA.getByRole("button", { name: "Iniciar liga" });
    await expect(startButton).toBeEnabled();

    // Open the start modal and pick seasonLength 1 (teams-1 = 1).
    await startButton.click();
    await expect(pageA.getByRole("dialog", { name: "Iniciar liga" })).toBeVisible();
    await pageA.getByLabel("¿Cuántas jornadas?").fill("1");
    await pageA.getByRole("dialog", { name: "Iniciar liga" }).getByRole("button", { name: "Iniciar liga" }).click();

    // The league is started: badge "Iniciada" and the jornadas render one round
    // (a region labelled "Jornada 1") with the single A-team vs B-team matchup.
    await expect(pageA.getByText("Iniciada")).toBeVisible();
    await expect(pageA.getByRole("region", { name: "Jornada 1" })).toBeVisible();
    await expect(
      pageA.getByRole("region", { name: "Jornada 1" }).getByText(teamAName),
    ).toBeVisible();
    await expect(
      pageA.getByRole("region", { name: "Jornada 1" }).getByText(teamBName),
    ).toBeVisible();
    // Exactly one matchup in this single round.
    await expect(
      pageA.getByRole("region", { name: "Jornada 1" }).getByText("vs"),
    ).toHaveCount(1);

    // --- Post-start: B can no longer self-leave (controls hidden) ---
    await pageB.reload();
    await expect(pageB.getByText("Iniciada")).toBeVisible();
    await expect(pageB.getByRole("button", { name: "Desapuntarse" })).not.toBeVisible();
    await expect(pageB.getByRole("region", { name: "Jornada 1" }).getByText("vs")).toHaveCount(1);

    // --- Post-start: foreign non-member C gets a 404 on the started detail ---
    const emailC = uniqueEmail("outsider");
    await signup(pageC, emailC);
    await pageC.goto(`/leagues/${leagueId}`);
    await expect(pageC.getByText("Liga no encontrada o sin acceso.")).toBeVisible();
    await expect(pageC.getByRole("heading", { name: leagueName })).not.toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
    await contextC.close();
  }
});

/**
 * Locks the member-league visibility bug: a NON-OWNER member of a STARTED league
 * must see the league in their OWN /leagues list (under "Mis Ligas") so they can
 * navigate back and accept the match proposal (the "VS"). Before the fix the
 * list API only returned open leagues + the user's OWN leagues, so a started
 * league a member had JOINED was invisible and unreachable.
 */
test("started-league member sees the league in their own /leagues list", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    // --- Admin A: signup, team (11), league, joins with their own team ---
    await signup(pageA, uniqueEmail("mv-admin"));
    const teamAName = `A-Visores ${Date.now()}`;
    await createTeam(pageA, teamAName);
    const leagueName = `Liga Visible ${Date.now()}`;
    await createLeague(pageA, leagueName);
    await openLeagueCard(pageA, leagueName);
    await pageA.getByLabel("Tu equipo").selectOption({ label: teamAName });
    await pageA.getByRole("button", { name: "Apuntarse" }).click();
    await expect(pageA.getByText(teamAName)).toBeVisible();

    // --- User B (member, NOT owner): signup, team (11), joins A's OPEN league ---
    await signup(pageB, uniqueEmail("mv-rival"));
    const teamBName = `B-Contempladores ${Date.now()}`;
    await createTeam(pageB, teamBName);
    await pageB.goto("/leagues");
    await expect(pageB.getByRole("heading", { name: "Mis Ligas" })).toBeVisible();
    await openLeagueCard(pageB, leagueName);
    await pageB.getByLabel("Tu equipo").selectOption({ label: teamBName });
    await pageB.getByRole("button", { name: "Apuntarse" }).click();
    await expect(pageB.getByText(teamBName)).toBeVisible();

    // --- Admin A starts the league (2 teams → seasonLength 1) ---
    await pageA.reload();
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

    // --- THE BUG: B's OWN /leagues list must surface the started league ---
    // B is a member, not the owner — the started league belongs under "Mis
    // Ligas" and must be openable (that is how B accepts the match proposal).
    await pageB.goto("/leagues");
    await expect(pageB.getByRole("heading", { name: "Mis Ligas" })).toBeVisible();
    const mySection = pageB
      .getByRole("heading", { level: 2, name: "Mis Ligas" })
      .locator("..");
    await expect(mySection.getByText(leagueName)).toBeVisible();
    await expect(mySection.getByText("Iniciada")).toBeVisible();
    // The started league must not masquerade as a joinable open league.
    const openSection = pageB
      .getByRole("heading", { level: 2, name: "Ligas abiertas" })
      .locator("..");
    await expect(openSection.getByText(leagueName)).not.toBeVisible();

    // B can open the league and reach the matchup where the VS is accepted.
    await openLeagueCard(pageB, leagueName);
    await expect(pageB.getByRole("region", { name: "Jornada 1" })).toBeVisible();
    await expect(
      pageB.getByRole("region", { name: "Jornada 1" }).getByText("vs"),
    ).toHaveCount(1);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
