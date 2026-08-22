import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
test.use({ locale: "es-ES" });

/**
 * RAU-52b developer-only "Tipos de reglas" behavior E2E (run via
 * `pnpm run test:e2e:auth` with AUTH_MODE=auth + Postgres). Verifies:
 * - a DEVELOPER creates a ruleset through the inline tabbed editor
 *   (Siguiente → ... → Crear tipo de reglas) → the card appears and persists;
 * - EDITING a card loads it into the editor, a dirty field switch surfaces the
 *   unsaved-changes guard, Descartar navigates (restoring the field), and
 *   Guardar from the guard persists the whole ruleset (survives reload);
 * - a NON-developer gets a 403 panel on /dev/rulesets, no nav link, and the
 *   /api/dev/rulesets routes answer 403;
 * - league creation picks the chosen ruleset and the league card/detail show
 *   the ruleset badge.
 *
 * Promoting a user to developer is done directly in the DB (docker psql) — the
 * migration's first-league-owner heuristic cannot be relied on here. The role
 * rides the JWT snapshot, so the promoted account logs out/in to refresh it
 * before the nav link can appear.
 */

const uniqueEmail = (tag: string) =>
  `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

function promoteToDeveloper(email: string) {
  execFileSync("docker", [
    "compose",
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "bloodbowl",
    "-d",
    "bloodbowl",
    "-c",
    `UPDATE "User" SET role='developer' WHERE email='${email}'`,
  ]);
}

async function signup(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("password-123");
  await page.getByLabel("Nombre").fill("Entrenador E2E");
  await page.getByRole("button", { name: "Registrarse" }).last().click();
  await expect(page).toHaveURL("/");
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("password-123");
  await page.getByRole("button", { name: "Iniciar sesión" }).last().click();
  await expect(page).toHaveURL("/");
}

/** Signs up, promotes to developer in the DB, then re-logs in so the JWT picks
 * up the role and the nav link appears. */
async function signupAsDeveloper(page: Page): Promise<string> {
  const email = uniqueEmail("dev");
  await signup(page, email);
  promoteToDeveloper(email);
  // Logout lives in the avatar user menu (unified nav).
  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(
    page.getByRole("heading", { name: "Your league, in your pocket." }),
  ).toBeVisible();
  await login(page, email);
  return email;
}

test("developer creates a ruleset via the inline tabs, the unsaved guard protects edits, and a league picks it (badge)", async ({
  page,
}) => {
  await signupAsDeveloper(page);

  // The nav shows the developer-only section link.
  await expect(page.getByRole("link", { name: "Tipos de reglas" })).toBeVisible();
  await page.getByRole("link", { name: "Tipos de reglas" }).click();
  await expect(page).toHaveURL(/\/dev\/rulesets$/);

  // The seeded Estándar BB2025 card is on the grid.
  await expect(page.getByRole("heading", { name: /Tipos de reglas/ })).toBeVisible();
  await expect(page.getByText("Estándar BB2025")).toBeVisible();
  await expect(page.getByText("Activo").first()).toBeVisible();

  // Create a new ruleset through the inline tabbed editor.
  const rulesetName = `Liga Tier 1 ${Date.now()}`;
  await page.getByRole("button", { name: "+ Nuevo tipo" }).click();
  await expect(
    page.getByRole("tablist", { name: "Configuración del tipo de reglas" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "1 · Información" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByLabel("Nombre").fill(rulesetName);
  await page.getByRole("button", { name: "Siguiente →" }).click();

  // Tab 2 · Razas: 31 checkboxes, apply the Tier 1 preset.
  await expect(page.getByRole("checkbox")).toHaveCount(31);
  await page.getByRole("button", { name: "Tier 1", exact: true }).click();
  await page.getByRole("button", { name: "Siguiente →" }).click();

  // Tab 3 · Economía y plantilla: defaults pre-filled.
  await expect(page.getByLabel("Tesorería inicial")).toHaveValue("1000000");
  await expect(page.getByLabel("Mínimo de jugadores")).toHaveValue("11");
  await expect(page.getByLabel("Máximo de jugadores")).toHaveValue("16");
  await page.getByRole("button", { name: "Siguiente →" }).click();

  // Tab 4 · Gestión y reglas: create.
  await expect(page.getByText("Contratar / despedir")).toBeVisible();
  await page.getByRole("button", { name: "Crear tipo de reglas" }).click();

  // The cards grid updates with the new card.
  await expect(page.getByText(rulesetName)).toBeVisible();

  // Persists on reload (DB-backed, not client state).
  await page.reload();
  await expect(page.getByText(rulesetName)).toBeVisible();

  // Edit: the card loads into the editor, and a dirty field switch warns.
  const editedName = `Copa ${Date.now()}`;
  const card = page.locator("li").filter({ hasText: rulesetName });
  await card.getByRole("button", { name: "Editar" }).click();
  await expect(page.getByRole("tab", { name: "1 · Información" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByLabel("Nombre")).toHaveValue(rulesetName);

  // Modify a field and switch tabs → the unsaved-changes guard appears.
  await page.getByLabel("Nombre").fill(editedName);
  await page.getByRole("tab", { name: "2 · Razas" }).click();
  const guardDialog = page.getByRole("alertdialog", {
    name: "No has guardado los cambios de esta pestaña",
  });
  await expect(guardDialog).toBeVisible();

  // Descartar navigates to the requested tab and restores the field.
  await guardDialog.getByRole("button", { name: "Descartar cambios" }).click();
  await expect(guardDialog).toBeHidden();
  await expect(page.getByRole("checkbox").first()).toBeVisible();
  await page.getByRole("tab", { name: "1 · Información" }).click();
  await expect(page.getByLabel("Nombre")).toHaveValue(rulesetName);

  // Modify again and Guardar from the guard persists the whole ruleset.
  await page.getByLabel("Nombre").fill(editedName);
  await page.getByRole("tab", { name: "3 · Economía y plantilla" }).click();
  await expect(guardDialog).toBeVisible();
  await guardDialog.getByRole("button", { name: "Guardar" }).click();
  await expect(guardDialog).toBeHidden();
  await expect(page.getByLabel("Tesorería inicial")).toBeVisible();
  await expect(page.getByText(editedName)).toBeVisible();

  // The saved edit survives a reload.
  await page.reload();
  await expect(page.getByText(editedName)).toBeVisible();

  // Create a league and pick the edited ruleset: the badge shows on the card
  // and in the detail hero.
  await page.goto("/leagues");
  const leagueName = `Liga Ruleset E2E ${Date.now()}`;
  await page.getByRole("button", { name: "+ Nueva liga" }).first().click();
  await page.getByLabel("Nombre").fill(leagueName);
  await page.getByLabel("Tipo de reglas").selectOption({ label: editedName });
  await page.getByRole("button", { name: "Crear liga" }).click();
  await expect(page.getByText(leagueName)).toBeVisible();
  await expect(page.getByText(editedName)).toBeVisible();

  // Detail hero also carries the ruleset badge.
  await page
    .locator("li")
    .filter({ hasText: leagueName })
    .getByRole("link", { name: "Ver", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: leagueName })).toBeVisible();
  await expect(page.locator("header").getByText(editedName)).toBeVisible();
});

test("a non-developer user gets a 403 on the dev section and cannot POST", async ({ page }) => {
  const email = uniqueEmail("plain");
  await signup(page, email);

  // No developer nav link for a regular user.
  await expect(page.getByRole("link", { name: "Tipos de reglas" })).toHaveCount(0);

  // The dev page is server-gated: 403 panel.
  await page.goto("/dev/rulesets");
  await expect(page.getByRole("heading", { name: "Acceso restringido" })).toBeVisible();

  // The developer-only API refuses every call with 403.
  const listRes = await page.request.get("/api/dev/rulesets");
  expect(listRes.status()).toBe(403);
  const postRes = await page.request.post("/api/dev/rulesets", {
    data: {
      name: "Sneaky",
      races: ["human"],
      startingTreasury: 1000000,
      minPlayers: 11,
      maxPlayers: 16,
      hireFire: "between-jornadas",
      seasonReform: true,
      mercenaries: false,
      active: true,
    },
  });
  expect(postRes.status()).toBe(403);
});
