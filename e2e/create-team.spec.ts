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

test.describe("Create Team — Roster & Coaching Math (Human)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Race").selectOption("human");
    await expect(page.getByRole("region", { name: "Roster builder" })).toBeVisible();
  });

  test("adding players updates count, roster cost, and remaining budget", async ({ page }) => {
    // Initial state: empty roster, full treasury
    await expect(page.getByText("0 players · 0k / 1,000k gc")).toBeVisible();
    await expect(page.getByText("1,000k remaining")).toBeVisible();

    // Add 3 Linemen (50k each) -> 150k
    const addLineman = page.getByRole("button", { name: "Add Lineman" });
    await addLineman.click();
    await addLineman.click();
    await addLineman.click();
    await expect(page.getByText("3 players · 150k / 1,000k gc")).toBeVisible();
    await expect(page.getByText("850k remaining")).toBeVisible();
    await expect(page.getByText("(3/16)")).toBeVisible();

    // Add 1 Blitzer (85k) -> 235k
    await page.getByRole("button", { name: "Add Blitzer" }).click();
    await expect(page.getByText("4 players · 235k / 1,000k gc")).toBeVisible();
    await expect(page.getByText("765k remaining")).toBeVisible();
    await expect(page.getByText("(1/4)")).toBeVisible();

    // Add 1 Thrower (75k) -> 310k
    await page.getByRole("button", { name: "Add Thrower" }).click();
    await expect(page.getByText("5 players · 310k / 1,000k gc")).toBeVisible();
    await expect(page.getByText("690k remaining")).toBeVisible();

    // Roster table reflects the players and totals
    await expect(page.getByLabel("Player name for Player 1")).toHaveValue("Player 1");
    await expect(page.getByLabel("Player name for Player 5")).toHaveValue("Player 5");
    await expect(page.getByText("5 players", { exact: true })).toBeVisible();
    await expect(page.getByText("690k left", { exact: true })).toBeVisible();
  });

  test("enforces positional maximums and disables the add button at the limit", async ({ page }) => {
    // Ogre: max 1
    const addOgre = page.getByRole("button", { name: "Add Ogre" });
    await addOgre.click();
    await expect(page.getByText("(1/1)")).toBeVisible();
    await expect(addOgre).toBeDisabled();

    // Blitzer: max 4
    const addBlitzer = page.getByRole("button", { name: "Add Blitzer" });
    for (let i = 0; i < 4; i++) await addBlitzer.click();
    await expect(page.getByText("(4/4)")).toBeVisible();
    await expect(addBlitzer).toBeDisabled();

    // Roster total after 1 Ogre (140k) + 4 Blitzers (340k) = 480k
    await expect(page.getByText("5 players · 480k / 1,000k gc")).toBeVisible();
    await expect(page.getByText("520k remaining")).toBeVisible();
  });

  test("removing a player updates count and budget", async ({ page }) => {
    const addLineman = page.getByRole("button", { name: "Add Lineman" });
    await addLineman.click();
    await addLineman.click();
    await page.getByRole("button", { name: "Add Blitzer" }).click();
    // 2 Linemen (100k) + 1 Blitzer (85k) = 185k
    await expect(page.getByText("3 players · 185k / 1,000k gc")).toBeVisible();
    await expect(page.getByText("815k remaining")).toBeVisible();

    // Remove Player 1 (a Lineman) -> 135k
    await page.getByRole("button", { name: "Remove Player 1" }).click();
    await expect(page.getByText("2 players · 135k / 1,000k gc")).toBeVisible();
    await expect(page.getByText("865k remaining")).toBeVisible();
    await expect(page.getByLabel("Player name for Player 1")).not.toBeVisible();
  });

  test("coaching purchases update the coaching total correctly", async ({ page }) => {
    const coachingSection = page.getByRole("region", { name: "Coaching Staff" });
    await expect(coachingSection).toBeVisible();

    // Dedicated Fans start at 1 and are free -> total starts at 0
    await expect(coachingSection.getByText("0k gc", { exact: true })).toBeVisible();

    // 2 Rerolls x 50k = 100k
    await page.getByLabel("Rerolls").fill("2");
    await expect(coachingSection.getByText("100k gc", { exact: true })).toBeVisible();

    // +3 Assistant Coaches x 10k = 30k -> 130k
    await page.getByLabel("Assistant Coaches").fill("3");
    await expect(coachingSection.getByText("130k gc", { exact: true })).toBeVisible();

    // +2 Cheerleaders x 10k = 20k -> 150k
    await page.getByLabel("Cheerleaders").fill("2");
    await expect(coachingSection.getByText("150k gc", { exact: true })).toBeVisible();

    // Dedicated Fans 3 = 2 upgrades x 5k = 10k -> 160k
    await page.getByLabel("Dedicated Fans").fill("3");
    await expect(coachingSection.getByText("160k gc", { exact: true })).toBeVisible();

    // + Apothecary 50k -> 210k
    await page.getByLabel("Apothecary").check();
    await expect(coachingSection.getByText("210k gc", { exact: true })).toBeVisible();
  });

  test("roster and coaching costs combine into the team total", async ({ page }) => {
    // 3 Linemen (150k) + 1 Blitzer (85k) = 235k roster
    const addLineman = page.getByRole("button", { name: "Add Lineman" });
    await addLineman.click();
    await addLineman.click();
    await addLineman.click();
    await page.getByRole("button", { name: "Add Blitzer" }).click();
    await expect(page.getByText("4 players · 235k / 1,000k gc")).toBeVisible();

    // Coaching: 2 Rerolls (100k) + Apothecary (50k) = 150k
    await page.getByLabel("Rerolls").fill("2");
    await page.getByLabel("Apothecary").check();
    const coachingSection = page.getByRole("region", { name: "Coaching Staff" });
    await expect(coachingSection.getByText("150k gc", { exact: true })).toBeVisible();

    // Team total = 235k + 150k = 385k -> 615k remaining
    await expect(page.getByText("4 players · 385k / 1,000k gc")).toBeVisible();
    await expect(page.getByText("615k remaining")).toBeVisible();
  });

  test("going over budget with coaching blocks submission with an error", async ({ page }) => {
    await page.getByLabel("Team name").fill("Broke Reavers");

    // Roster: 4 Blitzers (340k) + Ogre (140k) + Lineman (50k) = 530k
    const addBlitzer = page.getByRole("button", { name: "Add Blitzer" });
    for (let i = 0; i < 4; i++) await addBlitzer.click();
    await page.getByRole("button", { name: "Add Ogre" }).click();
    await page.getByRole("button", { name: "Add Lineman" }).click();
    await expect(page.getByText("6 players · 530k / 1,000k gc")).toBeVisible();

    // Coaching max: 8 Rerolls (400k) + 6 Assistants (60k) + 6 Cheerleaders (60k)
    // + 2 fan upgrades (10k) + Apothecary (50k) = 580k
    await page.getByLabel("Rerolls").fill("8");
    await page.getByLabel("Assistant Coaches").fill("6");
    await page.getByLabel("Cheerleaders").fill("6");
    await page.getByLabel("Dedicated Fans").fill("3");
    await page.getByLabel("Apothecary").check();

    // 530k + 580k = 1,110k -> over budget by 110k
    await expect(page.getByText("Over budget by 110k")).toBeVisible();

    await page.getByRole("button", { name: "Create Team" }).click();
    await expect(page.getByText("Roster exceeds the 1,000,000 gc budget")).toBeVisible();
    // No redirect: still on the create page
    await expect(page).toHaveURL(/\/teams\/create$/);
  });
});