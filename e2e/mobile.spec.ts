import { test, expect, type Page } from "@playwright/test";

/**
 * Mobile viewport E2E (375x812).
 * Guards: no horizontal page overflow on any route, drawer behavior,
 * stacked mobile rows, and the native select usability.
 *
 * Local/anonymous mode teams live in an in-memory store (no persistence), so
 * teams are created through the UI and survive ONLY client-side navigation
 * within the same tab session — never a reload.
 */

/**
 * Creates a team via the wizard using client-side navigation so the shared
 * in-memory store is preserved (a full page load would reset it).
 */
async function createTeamViaUi(page: Page, name: string) {
  await page.getByRole("link", { name: "Create team" }).first().click();
  await page.getByLabel("Team name", { exact: true }).fill(name);
  await page.getByLabel("Race").selectOption("human");
  await page.getByRole("button", { name: "Next →" }).click();
  const addLineman = page.getByRole("button", { name: "Add Human Lineman" }).first();
  for (let i = 0; i < 11; i++) await addLineman.click();
  await page.getByRole("button", { name: /create team/i }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText(name)).toBeVisible();
}

test.describe("Mobile", () => {
  async function expectNoHorizontalOverflow(page: import("@playwright/test").Page, label: string) {
    const overflow = await page.evaluate(() => {
      const doc = document.scrollingElement!;
      return doc.scrollWidth - window.innerWidth;
    });
    expect(overflow, `${label}: no horizontal page overflow (extra=${overflow}px)`).toBeLessThanOrEqual(1);
  }

  test("home has no horizontal overflow with a team list", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await createTeamViaUi(page, "Mobile Reavers");
    await expectNoHorizontalOverflow(page, "home");
  });

  test("team detail has no horizontal overflow (stacked rows + coaching)", async ({ page }) => {
    await page.goto("/");
    await createTeamViaUi(page, "Mobile Reavers");
    // Client navigation to the detail page keeps the in-memory store.
    await page.getByRole("link", { name: /Mobile Reavers/ }).click();
    await page.waitForLoadState("networkidle");
    // Stacked roster rows (not a table) are visible
    await expect(page.getByRole("region", { name: "Roster" })).toBeVisible();
    await expectNoHorizontalOverflow(page, "detail");
    // Coaching breakdown visible with rerolls
    await expect(page.getByText("Rerolls")).toBeVisible();
  });

  test("create team wizard has no horizontal overflow and stacked availability rows", async ({ page }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Team name", { exact: true }).fill("Mobile New Team");
    await page.getByLabel("Race").selectOption("human");
    await page.getByRole("button", { name: "Next →" }).click();

    // Availability rows are stacked (Add buttons always visible) and no page overflow
    await expect(page.getByRole("button", { name: "Add Human Lineman" }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page, "create step2");

    // Adding a player updates the counter and the stacked roster row
    await page.getByRole("button", { name: "Add Human Lineman" }).first().click();
    await expect(page.getByText("1/16").first()).toBeVisible();
    await expect(page.getByLabel(/Player name for /).first()).toBeVisible();
    await expectNoHorizontalOverflow(page, "create step2 with player");
  });

  test("drawer opens from hamburger, shows the nav links, and closes on scrim", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const burger = page.getByRole("button", { name: /open navigation menu/i });
    await expect(burger).toBeVisible();
    await burger.click();
    const drawer = page.getByRole("complementary", { name: "Mobile navigation" });
    await expect(drawer).toBeVisible();
    // The drawer shares the unified nav links — only working links ship
    // (Teams and Matches are hidden until dedicated pages exist, RAU-60).
    await expect(drawer.getByRole("link", { name: "Leagues" })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Teams" })).toHaveCount(0);
    await expect(drawer.getByRole("link", { name: "Matches" })).toHaveCount(0);
    // Close via scrim click (top-right area outside the drawer)
    await page.mouse.click(360, 400);
    await expect(page.getByRole("complementary", { name: "Mobile navigation" })).not.toBeVisible();
  });

  test("native race select works in step 1", async ({ page }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");
    const select = page.getByLabel("Race");
    await expect(select).toBeVisible();
    await select.selectOption("orc");
    await expect(select).toHaveValue("orc");
    await page.getByLabel("Team name", { exact: true }).fill("Orc Mobile");
    await page.getByRole("button", { name: "Next →" }).click();
    await expect(page.getByRole("button", { name: "Add Orc Lineman" }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page, "orc create step2");
  });
});
