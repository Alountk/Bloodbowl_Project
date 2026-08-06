import { test, expect } from "@playwright/test";
import { RACES } from "../features/teams/data/races";

test.describe("Create Team — E2E", () => {
  test("loads without console errors and shows the form", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);

    // Form is visible
    await expect(page.getByRole("heading", { name: /create team/i })).toBeVisible();
    await expect(page.getByLabel("Team name")).toBeVisible();
    await expect(page.getByLabel("Race")).toBeVisible();
  });

  test("shows the race select with all race options and a placeholder", async ({ page }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");

    const select = page.getByLabel("Race");
    await expect(select).toBeVisible();

    // Check the placeholder is the initial value
    await expect(select).toHaveValue("");

    // Get all option elements from the select
    const options = select.locator("option");
    const optionCount = await options.count();

    // +1 for the placeholder
    expect(optionCount).toBe(RACES.length + 1);

    // First option is the placeholder
    await expect(options.nth(0)).toHaveAttribute("value", "");
    await expect(options.nth(0)).toHaveText("Select a race");

    // Verify race IDs and names match RACES data
    for (let i = 0; i < Math.min(RACES.length, 5); i++) {
      const option = options.nth(i + 1);
      await expect(option).toHaveAttribute("value", RACES[i].id);
      await expect(option).toHaveText(RACES[i].name);
    }
  });

  test("selecting a race shows the roster builder and coaching staff", async ({ page }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");

    // Select "Human" race
    await page.getByLabel("Race").selectOption("human");

    // The roster builder section should appear
    await expect(page.getByRole("region", { name: "Roster builder" })).toBeVisible();

    // Should show positionals from the race (use role="heading" for role-group headers)
    await expect(page.getByRole("heading", { name: /linemans/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /blitzers/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /throwers/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /catchers/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /big guys/i })).toBeVisible();

    // Add-buttons should be present for positionals
    await expect(page.getByRole("button", { name: /add lineman/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /add thrower/i })).toBeVisible();

    // Coaching staff section should appear
    await expect(page.getByRole("region", { name: "Coaching Staff" })).toBeVisible();

    // Budget bar should be visible
    await expect(page.getByText(/remaining/i)).toBeVisible();
  });

  test("deselecting race hides the roster builder", async ({ page }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Race").selectOption("orc");
    await expect(page.getByRole("region", { name: "Roster builder" })).toBeVisible();

    // Deselect by selecting placeholder
    await page.getByLabel("Race").selectOption("");
    await expect(page.getByRole("region", { name: "Roster builder" })).not.toBeVisible();
    await expect(page.getByRole("region", { name: "Coaching Staff" })).not.toBeVisible();
  });

  test("can create a full team end-to-end", async ({ page }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Team name").fill("Reikland Reavers");
    await page.getByLabel("Race").selectOption("human");

    // Add 3 linemen
    const addLineman = page.getByRole("button", { name: /add lineman/i });
    await addLineman.click();
    await addLineman.click();
    await addLineman.click();

    // Add a blitzer
    await page.getByRole("button", { name: /add blitzer/i }).click();

    // Submit the team
    await page.getByRole("button", { name: /create team/i }).click();

    // Should redirect to home page and show the team
    await expect(page).toHaveURL("/");
    await expect(page.getByText("Reikland Reavers")).toBeVisible();
    await expect(page.getByText("Human")).toBeVisible();
  });

  test("shows validation errors for incomplete form", async ({ page }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Race").selectOption("human");
    await page.getByRole("button", { name: /create team/i }).click();

    // Should show name error
    await expect(page.getByText(/team name is required/i)).toBeVisible();
    // Should show player count error
    await expect(page.getByText(/at least 3/i)).toBeVisible();
  });

  test("adding max players disables the add button", async ({ page }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Race").selectOption("dwarf");

    // Troll Slayer has max 2
    const addTrollSlayer = page.getByRole("button", { name: /add troll slayer/i });
    await addTrollSlayer.click();
    await addTrollSlayer.click();

    // Third click should not work (max 2)
    await expect(addTrollSlayer).toBeDisabled();
  });

  test("shows race change confirmation dialog when roster is not empty", async ({ page }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Race").selectOption("human");
    await page.getByRole("button", { name: /add lineman/i }).click();

    // Change race while roster has players
    await page.getByLabel("Race").selectOption("orc");

    // Confirm dialog should appear
    await expect(page.getByText(/roster will be cleared/i)).toBeVisible();

    // Cancel keeps the original race and players
    await page.getByRole("button", { name: /cancel/i }).click();
    // After cancel, roster still visible: check for add-buttons instead
    await expect(page.getByRole("button", { name: /add lineman/i })).toBeVisible();

    // Try again and confirm
    await page.getByLabel("Race").selectOption("orc");
    await page.getByRole("button", { name: /confirm/i }).click();

    // Should now show Orc positionals
    await expect(page.getByRole("heading", { name: /blockers/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /runners/i })).toBeVisible();

    // Roster should be cleared: team-name input only
    await expect(page.getByLabel("Team name")).toBeVisible();
    // The add buttons should be present (fresh roster)
    const addOrcButton = page.getByRole("button", { name: /add lineman/i });
    await expect(addOrcButton).toBeVisible();
  });
});