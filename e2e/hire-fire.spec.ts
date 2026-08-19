import { test, expect, type Page } from "@playwright/test";
test.use({ locale: "es-ES" });

/**
 * Real-DB E2E for the roster hire/fire journeys (run via `pnpm run
 * test:e2e:auth` with AUTH_MODE=auth and a running Postgres). Covers RAU-11
 * (hire a positional from the race catalog, paying its cost from the spendable
 * balance) and RAU-10 (fire/retire a player; BB2025 no refund keeps the
 * balance flat, and a team cannot drop below the 11-player minimum).
 *
 * Each test builds its own fresh team (unique emails/names so the persisted
 * Postgres never collides) and drives the real UI: hire via the Contratar
 * dialog, fire via the improve modal's Despedir confirmation.
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
  // Normalize the auto-generated fantasy names so rows can be addressed by a
  // stable name when firing.
  const nameInputs = page.getByLabel(/Nombre del jugador para /);
  for (let i = 0; i < playerCount; i++) {
    await nameInputs.nth(i).fill(`Player ${i + 1}`);
  }
  await page.getByRole("button", { name: /crear equipo/i }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText(name)).toBeVisible();
}

/** Resolves an owned team's id by name via GET /api/teams. */
async function ownedTeamId(page: Page, name: string): Promise<string> {
  const res = await page.request.get("/api/teams");
  expect(res.status()).toBe(200);
  const teams = (await res.json()) as { id: string; name: string }[];
  const team = teams.find((t) => t.name === name);
  expect(team, `owned team "${name}"`).toBeDefined();
  return team!.id;
}

function rosterTable(page: Page) {
  return page.getByTestId("team-roster-table");
}

async function openTeamDetail(page: Page, teamId: string) {
  await page.goto(`/teams/${teamId}`);
  await expect(rosterTable(page)).toBeVisible();
}

/**
 * A fresh 11-lineman human team with default coaching has a spendable balance
 * of 1 000 000 − 11 × 50 000 = 450 000.
 */
test.describe("Roster hire/fire (RAU-11/RAU-10)", () => {
  test("owner hires a blitzer: roster grows, balance drops, persists on reload", async ({ page }) => {
    const email = uniqueEmail("hire");
    await signup(page, email);
    await createTeam(page, "Reikland Hires");

    const teamId = await ownedTeamId(page, "Reikland Hires");
    await openTeamDetail(page, teamId);

    // 11 linemen, balance 450 000.
    await expect(rosterTable(page).locator("tbody tr")).toHaveCount(11);
    await expect(page.getByText("Tesorería: 450 000")).toBeVisible();

    // Hire a blitzer (85k) from the Contratar dialog.
    await page.getByTestId("open-hire-dialog").click();
    await expect(page.getByRole("dialog", { name: "Contratar jugadores" })).toBeVisible();
    await expect(page.getByText("Tesorería disponible: 450 000")).toBeVisible();
    await page.getByRole("button", { name: "Contratar Human Blitzer" }).click();

    // Roster grows to 12 and the balance drops by 85k → 365 000.
    await expect(rosterTable(page).locator("tbody tr")).toHaveCount(12);
    await expect(page.getByText("Tesorería: 365 000")).toBeVisible();

    // The hire persists across a reload.
    await page.reload();
    await expect(rosterTable(page)).toBeVisible();
    await expect(rosterTable(page).locator("tbody tr")).toHaveCount(12);
    await expect(page.getByText("Tesorería: 365 000")).toBeVisible();
  });

  test("fires a hired player: removed from the roster, no refund (balance unchanged), persists", async ({ page }) => {
    const email = uniqueEmail("fire");
    await signup(page, email);
    await createTeam(page, "Reikland Fires");

    const teamId = await ownedTeamId(page, "Reikland Fires");
    await openTeamDetail(page, teamId);

    // Hire a blitzer so there is a 12th player to fire.
    await page.getByTestId("open-hire-dialog").click();
    await page.getByRole("button", { name: "Contratar Human Blitzer" }).click();
    await expect(rosterTable(page).locator("tbody tr")).toHaveCount(12);
    await expect(page.getByText("Tesorería: 365 000")).toBeVisible();

    // Open the hired blitzer's improve modal and fire it with the confirmation.
    const blitzerRow = rosterTable(page).locator("tbody tr", { hasText: "Human Blitzer" });
    await blitzerRow.click();
    await expect(page.getByTestId("improve-modal")).toBeVisible();
    await page.getByTestId("modal-fire").click();
    await expect(page.getByText(/despedir no devuelve el coste/i)).toBeVisible();
    await page.getByTestId("modal-fire-confirm").click();

    // Roster back to 11 and the balance stays FLAT (no refund): 365 000.
    await expect(rosterTable(page).locator("tbody tr")).toHaveCount(11);
    await expect(page.getByText("Tesorería: 365 000")).toBeVisible();

    // The fire persists and the no-refund treasury decrement is on the row.
    await page.reload();
    await expect(rosterTable(page)).toBeVisible();
    await expect(rosterTable(page).locator("tbody tr")).toHaveCount(11);
    const res = await page.request.get(`/api/teams/${teamId}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { treasury: number };
    // 11 linemen still on the roster → balance 365 000 with treasury = −85k.
    expect(body.treasury).toBe(-85_000);
    await expect(page.getByText("Tesorería: 365 000")).toBeVisible();
  });

  test("blocks firing below the 11-player minimum with a clear message", async ({ page }) => {
    const email = uniqueEmail("firemin");
    await signup(page, email);
    await createTeam(page, "Reikland Minimum");

    const teamId = await ownedTeamId(page, "Reikland Minimum");
    await openTeamDetail(page, teamId);
    await expect(rosterTable(page).locator("tbody tr")).toHaveCount(11);

    // Try to fire the first lineman — 11 → 10 is below the minimum.
    await rosterTable(page).locator("tbody tr").first().click();
    await expect(page.getByTestId("improve-modal")).toBeVisible();
    await page.getByTestId("modal-fire").click();
    await page.getByTestId("modal-fire-confirm").click();

    // The server blocks it and the modal surfaces the message verbatim.
    await expect(page.getByTestId("improve-modal").getByRole("alert")).toContainText(
      "A team cannot drop below 11 players",
    );
    await expect(page.getByTestId("improve-modal")).toBeVisible();
    // Cancel keeps the roster intact at 11.
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(rosterTable(page).locator("tbody tr")).toHaveCount(11);
  });
});
