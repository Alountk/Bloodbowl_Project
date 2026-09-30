import { test, expect, type Page } from "@playwright/test";

/**
 * Delete-flow E2E (AUTH_MODE=local so teams live in the shared in-memory store).
 *
 * Verifies the teams page delete journey: a team card's Delete control opens the
 * confirmation modal with the irreversible Spanish copy; Cancelar keeps the
 * team; Eliminar removes it so the list no longer shows it.
 *
 * Local mode persists nothing (localStorage seeding is gone), so teams are
 * created through the UI and survive only client-side navigation within the
 * same tab session — never a reload.
 */

/**
 * Creates a team via the wizard from the home dashboard using client-side
 * navigation so the shared in-memory store is preserved.
 */
async function createTeamViaUi(page: Page, name: string) {
  // The summary is the hydration marker: a pre-hydration dashboard still shows
  // "Create team" for a user who already has teams.
  await page.getByRole("link", { name: /ready to improve/i }).waitFor();
  const quickCreate = page.getByRole("link", { name: "Create team" });
  // Quick action exists only for a zero-team user (#268); otherwise history
  // back to the wizard — a reload would wipe the tab-session store.
  if (await quickCreate.count()) await quickCreate.first().click();
  else await page.goBack();
  await expect(page).toHaveURL("/teams/create");
  await page.getByLabel("Team name", { exact: true }).fill(name);
  await page.getByLabel("Race").selectOption("human");
  await page.getByRole("button", { name: "Next →" }).click();
  const addLineman = page.getByRole("button", { name: "Add Human Lineman" }).first();
  for (let i = 0; i < 11; i++) await addLineman.click();
  await page.getByRole("button", { name: /create team/i }).click();
  await expect(page).toHaveURL("/");
  // Reach the teams page through the summary link (client navigation keeps the
  // store), confirm the card, then walk back home for the next creation.
  await page.getByRole("link", { name: /ready to improve/i }).click();
  await expect(page).toHaveURL(/\/teams$/);
  await expect(page.getByText(name)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL("/");
}

test.describe("Delete Team — E2E", () => {
  test("teams-page card delete opens the modal with Spanish copy and Cancelar keeps the team", async ({
    page,
  }) => {
    await page.goto("/");
    await createTeamViaUi(page, "Doomed Reavers");

    // The card exposes a Delete control with the team name in its accessible name.
    await page.getByRole("link", { name: /ready to improve/i }).click();
    await page.getByRole("button", { name: "Eliminar Doomed Reavers" }).click();

    // Modal appears with the irreversible Spanish message and both actions.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/Esta acción no se puede deshacer/i)).toBeVisible();
    await expect(page.getByText(/se archivará y se eliminará de tu lista/i)).toBeVisible();

    // Cancelar keeps the team and closes the dialog.
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("Doomed Reavers")).toBeVisible();
  });

  test("Eliminar removes the team from the list", async ({ page }) => {
    await page.goto("/");
    await createTeamViaUi(page, "Doomed Reavers");
    // A second team makes the removal observable in the list grid.
    await createTeamViaUi(page, "Survivor Orcs");

    // The cards render on the teams page now (#268).
    await page.getByRole("link", { name: /ready to improve/i }).click();
    await page.getByRole("button", { name: "Eliminar Doomed Reavers" }).click();
    // exact: the card buttons share the "Eliminar" prefix in their names.
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();

    // The removed team disappears; the other team remains.
    await expect(page.getByText("Doomed Reavers")).not.toBeVisible();
    await expect(page.getByText("Survivor Orcs")).toBeVisible();
  });
});
