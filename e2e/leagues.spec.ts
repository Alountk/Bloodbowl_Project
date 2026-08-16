import { test, expect, type Page } from "@playwright/test";

/**
 * Real-DB leagues E2E (run via `pnpm run test:e2e:auth` with AUTH_MODE=auth and a
 * running Postgres). Verifies the Pattern-2 leagues journey:
 * create league → card shows → open detail → assign an unassigned team → member
 * listed with race/players → expel the member → member leaves the detail list.
 *
 * Leagues are API-backed (Postgres) and every endpoint requires a session (401
 * unauthenticated), so this spec runs in the auth suite and is excluded from the
 * default local `test:e2e` config (which stays green with AUTH_MODE=local where
 * /api/leagues returns 401 and the list page shows the empty state).
 */

const uniqueEmail = () => `league-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

async function signup(page: Page, email: string, password: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).last().click();
  await expect(page).toHaveURL("/");
}

async function createTeam(page: Page) {
  await page.goto("/teams/create");
  await page.getByLabel("Team name").fill("Middenheim Marauders");
  await page.getByLabel("Race").selectOption("human");
  await page.getByRole("button", { name: /next/i }).click();
  // Three players so the team is valid.
  const addLineman = page.getByRole("button", { name: "Add Lineman" }).first();
  for (let i = 0; i < 11; i++) await addLineman.click();
  await page.getByRole("button", { name: "Add Blitzer" }).first().click();
  await page.getByRole("button", { name: /create team/i }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Middenheim Marauders")).toBeVisible();
}

async function createLeague(page: Page, name: string) {
  await page.goto("/leagues");
  await expect(page.getByRole("heading", { name: "Mis Ligas" })).toBeVisible();
  await page.getByRole("button", { name: "+ Nueva liga" }).first().click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Descripción").fill("Liga de verano");
  await page.getByRole("button", { name: "Crear liga" }).click();
  // Card with the league name appears on the refreshed list.
  await expect(page.getByText(name)).toBeVisible();
}

test("create league → card shows → assign team → member listed → expel", async ({ page }) => {
  const email = uniqueEmail();
  const password = "password-123";
  await signup(page, email, password);

  await createTeam(page);

  // Unique league name per run so the auth suite is idempotent (the name is
  // globally unique; a fixed name would collide with rows persisted by a
  // previous run and surface the correct-but-failing 409).
  const leagueName = `Liga E2E ${Date.now()}`;
  await createLeague(page, leagueName);

  // Open the detail via the just-created league's card "Ver" link (the list is
  // now public: foreign OPEN leagues from prior runs may precede ours).
  await page
    .locator("li")
    .filter({ hasText: leagueName })
    .getByRole("link", { name: "Ver", exact: true })
    .click();
  await expect(page).toHaveURL(/\/leagues\/.+$/);
  await expect(page.getByRole("heading", { name: leagueName })).toBeVisible();
  // Description shown in the detail hero (scoped to the header so the public
  // list repetition of "Liga de verano" never causes a strict-mode clash).
  await expect(
    page.locator("header").getByText("Liga de verano"),
  ).toBeVisible();

  // Assign the unassigned team (the owner joins with their own team via the
  // public "Unirse" select; the label is now "Tu equipo").
  await page.getByLabel("Tu equipo").selectOption({ label: "Middenheim Marauders" });
  await page.getByRole("button", { name: "Apuntarse" }).click();

  // The team becomes a member of the league (name + race visible).
  await expect(page.getByText("Middenheim Marauders")).toBeVisible();
  await expect(page.getByText(/\u00b7/).first()).toBeVisible();

  // Expel the team and confirm it leaves the member list.
  await page.getByRole("button", { name: "Expulsar" }).first().click();
  await expect(page.getByText("Middenheim Marauders")).not.toBeVisible();
});

test("deleting an assigned team surfaces the 409 archive guard instead of removing it", async ({
  page,
}) => {
  const email = uniqueEmail();
  const password = "password-123";
  await signup(page, email, password);

  await createTeam(page);
  const leagueName = `Liga E2E Guard ${Date.now()}`;
  await createLeague(page, leagueName);

  // Assign the team so it becomes a league member.
  await page
    .locator("li")
    .filter({ hasText: leagueName })
    .getByRole("link", { name: "Ver", exact: true })
    .click();
  await expect(page).toHaveURL(/\/leagues\/.+$/);
  await expect(page.getByRole("heading", { name: leagueName })).toBeVisible();
  await page.getByLabel("Tu equipo").selectOption({ label: "Middenheim Marauders" });
  await page.getByRole("button", { name: "Apuntarse" }).click();
  await expect(page.getByText("Middenheim Marauders")).toBeVisible();

  // Go home and attempt to delete the member team.
  await page.goto("/");
  await expect(page.getByText("Middenheim Marauders")).toBeVisible();
  await page.getByRole("button", { name: "Delete Middenheim Marauders" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Confirm the delete → the API returns 409 and the guard message appears.
  await page.getByRole("button", { name: "Eliminar" }).click();
  await expect(page.getByText(leagueName)).toBeVisible();
  await expect(
    page.getByText(
      `No se puede borrar este equipo — pertenece a la liga ${leagueName}. Para poder borrarlo, primero expulsalo de la liga.`,
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Entendido" })).toBeVisible();

  // Entendido closes the dialog; the team remains in the list (not removed).
  await page.getByRole("button", { name: "Entendido" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("Middenheim Marauders")).toBeVisible();
});

// --- Regression: archived teams must not be assignable to a league ---
const archiveGuardPassword = "password-123";

async function archiveGuardSignup(page: import("@playwright/test").Page) {
  const email = `guard-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(archiveGuardPassword);
  await page.getByRole("button", { name: "Sign up" }).last().click();
  await expect(page).toHaveURL("/");
}

async function archiveGuardCreateTeam(page: import("@playwright/test").Page, name: string) {
  await page.goto("/teams/create");
  await page.getByLabel("Team name").fill(name);
  await page.getByLabel("Race").selectOption("human");
  await page.getByRole("button", { name: /next/i }).click();
  const add = page.getByRole("button", { name: "Add Lineman" }).first();
  for (let i = 0; i < 11; i++) await add.click();
  await page.getByRole("button", { name: /create team/i }).click();
  await expect(page).toHaveURL("/");
}

async function archiveGuardCreateLeague(page: import("@playwright/test").Page, name: string) {
  await page.goto("/leagues");
  await page.getByRole("button", { name: "+ Nueva liga" }).first().click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByRole("button", { name: "Crear" }).click();
  await expect(page.getByText(name)).toBeVisible();
  return name;
}

/** Clicks the "Ver" link of the card whose heading matches `name`, then waits
 * for the detail URL (Next App Router soft navigation is not awaited by
 * click). */
async function openLeagueCard(page: import("@playwright/test").Page, name: string) {
  await page
    .locator("li")
    .filter({ hasText: name })
    .getByRole("link", { name: "Ver", exact: true })
    .click();
  await expect(page).toHaveURL(/\/leagues\/.+$/);
}

async function archiveGuardArchive(page: import("@playwright/test").Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await page.getByRole("button", { name: "Eliminar" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(name) })).not.toBeVisible();
}

test("archived team must not appear in the league assign select", async ({ page }) => {
  await archiveGuardSignup(page);
  await archiveGuardCreateTeam(page, "Archivable Reavers");
  const leagueName = await archiveGuardCreateLeague(
    page,
    `Guard Liga ${Date.now()}`,
  );
  await archiveGuardArchive(page, "Archivable Reavers");

  await page.goto("/leagues");
  await openLeagueCard(page, leagueName);
  const options = page.locator("#league-team-select option");
  const texts: string[] = [];
  const count = await options.count();
  for (let i = 0; i < count; i++)
    texts.push((await options.nth(i).textContent()) ?? "");
  expect(texts.some((t) => t.includes("Archivable Reavers"))).toBe(false);
});

test("direct API assign of an archived team returns 409", async ({ page }) => {
  await archiveGuardSignup(page);
  await archiveGuardCreateTeam(page, "API Archivable");
  const leagueName = await archiveGuardCreateLeague(
    page,
    `API Guard Liga ${Date.now()}`,
  );

  const teams = await page.request.get("/api/teams");
  const leagues = await page.request.get("/api/leagues");
  const teamId = (await teams.json())[0].id;
  // Find OUR league by name — the list is now public, so [0] may be a foreign
  // OPEN league from a previous run.
  const leagueId = (await leagues.json()).find(
    (l: { name: string }) => l.name === leagueName,
  )?.id;
  expect(leagueId).toBeDefined();

  await archiveGuardArchive(page, "API Archivable");

  const assign = await page.request.post(`/api/leagues/${leagueId}/teams`, {
    data: { teamId },
  });
  expect(assign.status()).toBe(409);
});

