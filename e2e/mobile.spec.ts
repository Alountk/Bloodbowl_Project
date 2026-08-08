import { test, expect } from "@playwright/test";

/**
 * Mobile viewport E2E (375x812).
 * Guards: no horizontal page overflow on any route, drawer behavior,
 * stacked mobile rows, and the native select usability.
 */
test.describe("Mobile", () => {
  const TEAM = {
    id: "mobile-e2e-team",
    name: "Mobile Reavers",
    raceId: "human",
    leagueType: "open",
    roster: [
      { id: "m1", name: "Player 1", positionalKey: "lineman" },
      { id: "m2", name: "Player 2", positionalKey: "blitzer" },
      { id: "m3", name: "Player 3", positionalKey: "thrower" },
    ],
    coaching: { rerolls: 2, dedicatedFans: 2, assistantCoaches: 1, cheerleaders: 2, apothecary: true },
  };

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate((team) => {
      localStorage.setItem("bb_teams_v1", JSON.stringify([team]));
    }, TEAM);
  });

  async function expectNoHorizontalOverflow(page: import("@playwright/test").Page, label: string) {
    const overflow = await page.evaluate(() => {
      const doc = document.scrollingElement!;
      return doc.scrollWidth - window.innerWidth;
    });
    expect(overflow, `${label}: no horizontal page overflow (extra=${overflow}px)`).toBeLessThanOrEqual(1);
  }

  test("home has no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Mobile Reavers")).toBeVisible();
    await expectNoHorizontalOverflow(page, "home");
  });

  test("team detail has no horizontal overflow (stacked rows + coaching)", async ({ page }) => {
    await page.goto("/teams/mobile-e2e-team");
    await page.waitForLoadState("networkidle");
    // Stacked roster rows (not a table) are visible
    await expect(page.getByText("Player 1")).toBeVisible();
    await expectNoHorizontalOverflow(page, "detail");
    // Coaching breakdown visible with apothecary SÍ
    await expect(page.getByText("Segundas oportunidades")).toBeVisible();
  });

  test("create team wizard has no horizontal overflow and stacked availability rows", async ({ page }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Team name").fill("Mobile New Team");
    await page.getByLabel("Race").selectOption("human");
    await page.getByRole("button", { name: /siguiente/i }).click();

    // Availability rows are stacked (Add buttons always visible) and no page overflow
    await expect(page.getByRole("button", { name: "Add Lineman" }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page, "create step2");

    // Adding a player updates the counter and the stacked roster row
    await page.getByRole("button", { name: "Add Lineman" }).first().click();
    await expect(page.getByText("1/16").first()).toBeVisible();
    await expect(page.getByLabel("Player name for Player 1")).toBeVisible();
    await expectNoHorizontalOverflow(page, "create step2 with player");
  });

  test("drawer opens from hamburger and closes on scrim", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const burger = page.getByRole("button", { name: /open navigation menu/i });
    await expect(burger).toBeVisible();
    await burger.click();
    await expect(page.getByRole("complementary", { name: "Mobile navigation" })).toBeVisible();
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
    await page.getByLabel("Team name").fill("Orc Mobile");
    await page.getByRole("button", { name: /siguiente/i }).click();
    await expect(page.getByRole("button", { name: "Add Lineman" }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page, "orc create step2");
  });
});
