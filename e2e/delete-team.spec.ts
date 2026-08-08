import { test, expect, type Page } from "@playwright/test";

/**
 * Delete-flow E2E (AUTH_MODE=local so teams live in the LocalStorage store).
 *
 * Verifies the home delete journey: a team card's Delete control opens the
 * confirmation modal with the irreversible Spanish copy; Cancelar keeps the
 * team; Eliminar archives/removes it so the list no longer shows it.
 */

const TEAM = {
  id: "e2e-delete-team",
  name: "Doomed Reavers",
  raceId: "human",
  leagueId: null,
  roster: [
    { id: "d1", name: "Player 1", positionalKey: "lineman" },
    { id: "d2", name: "Player 2", positionalKey: "lineman" },
    { id: "d3", name: "Player 3", positionalKey: "blitzer" },
  ],
  coaching: {
    rerolls: 2,
    dedicatedFans: 1,
    assistantCoaches: 0,
    cheerleaders: 0,
    apothecary: false,
  },
};

async function seedAndGoHome(page: Page) {
  await page.goto("/");
  await page.evaluate((team) => {
    localStorage.setItem("bb_teams_v1", JSON.stringify([team]));
  }, TEAM);
  await page.reload();
}

test.describe("Delete Team — E2E", () => {
  test("home card delete opens the modal with Spanish copy and Cancelar keeps the team", async ({
    page,
  }) => {
    await seedAndGoHome(page);
    await expect(page.getByText("Doomed Reavers")).toBeVisible();

    // The card exposes a Delete control with the team name in its accessible name.
    await page.getByRole("button", { name: "Delete Doomed Reavers" }).click();

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
    await seedAndGoHome(page);
    await expect(page.getByText("Doomed Reavers")).toBeVisible();

    await page.getByRole("button", { name: "Delete Doomed Reavers" }).click();

    // A second team makes the removal observable in the list grid.
    await page.evaluate((team) => {
      const raw = localStorage.getItem("bb_teams_v1") ?? "[]";
      const teams = JSON.parse(raw) as Array<Record<string, unknown>>;
      teams.push({
        ...team,
        id: "e2e-survivor",
        name: "Survivor Orcs",
        raceId: "orc",
      });
      localStorage.setItem("bb_teams_v1", JSON.stringify(teams));
    }, TEAM);
    await page.reload();
    await expect(page.getByText("Doomed Reavers")).toBeVisible();
    await expect(page.getByText("Survivor Orcs")).toBeVisible();

    await page.getByRole("button", { name: "Delete Doomed Reavers" }).click();
    await page.getByRole("button", { name: "Eliminar" }).click();

    // The archived team disappears; the other team remains.
    await expect(page.getByText("Doomed Reavers")).not.toBeVisible();
    await expect(page.getByText("Survivor Orcs")).toBeVisible();
  });
});
