import { test, expect } from "@playwright/test";
import { RACES } from "../features/teams/data/races";

/** Fills step 1 (name + race) and advances to step 2. */
async function goToStep2(page: import("@playwright/test").Page, name: string, raceId: string) {
  await page.getByLabel("Team name").fill(name);
  await page.getByLabel("Race").selectOption(raceId);
  await page.getByRole("button", { name: /siguiente/i }).click();
}

test.describe("Create Team — E2E", () => {
  test("loads without console errors and shows the form (step 1)", async ({ page }) => {
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

    // Step 1 form is visible
    await expect(page.getByRole("heading", { name: /paso 1 · datos del equipo/i })).toBeVisible();
    await expect(page.getByLabel("Team name")).toBeVisible();
    await expect(page.getByLabel("Race")).toBeVisible();
    await expect(page.getByRole("button", { name: /siguiente/i })).toBeVisible();
  });

  test("shows the race select with all race options and a placeholder", async ({ page }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");

    const select = page.getByLabel("Race");
    await expect(select).toBeVisible();
    await expect(select).toHaveValue("");

    const options = select.locator("option");
    const optionCount = await options.count();
    expect(optionCount).toBe(RACES.length + 1);

    await expect(options.nth(0)).toHaveAttribute("value", "");
    await expect(options.nth(0)).toHaveText("Select a race");

    for (let i = 0; i < Math.min(RACES.length, 5); i++) {
      const option = options.nth(i + 1);
      await expect(option).toHaveAttribute("value", RACES[i].id);
      await expect(option).toHaveText(RACES[i].name);
    }
  });

  test("step 1 shows validation errors when Siguiente is clicked without data", async ({ page }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /siguiente/i }).click();
    await expect(page.getByText(/team name is required/i)).toBeVisible();
    // The validation alert appears (the placeholder option also contains "Select a race").
    await expect(page.getByRole("alert").filter({ hasText: /select a race/i })).toBeVisible();

    // Still on step 1 — no builder content.
    await expect(page.getByRole("region", { name: "Plantilla" })).not.toBeVisible();
  });

  test("advancing to step 2 shows Plantilla, Jugadores disponibles and Coaching Staff", async ({
    page,
  }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");

    await goToStep2(page, "Reikland Reavers", "human");

    // Step 2 hero shows the team name + race subline.
    await expect(page.getByRole("heading", { name: /reikland reavers/i })).toBeVisible();
    await expect(page.getByText(/human · paso 2/i)).toBeVisible();

    // Sections render.
    await expect(page.getByRole("region", { name: "Plantilla" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Jugadores disponibles" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Coaching Staff" })).toBeVisible();

    // Availability table shows positional Add buttons.
    await expect(page.getByRole("button", { name: "Add Lineman" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Thrower" })).toBeVisible();

    // Budget bar.
    await expect(page.getByText(/remaining/i)).toBeVisible();
  });

  test("Editar nombre/raza returns to step 1 preserving the entered team name", async ({ page }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");

    await goToStep2(page, "Reikland Reavers", "human");
    await page.getByRole("button", { name: /editar nombre\/raza/i }).click();

    await expect(page.getByLabel("Team name")).toHaveValue("Reikland Reavers");
    await expect(page.getByLabel("Race")).toHaveValue("human");
    await expect(page.getByRole("button", { name: /siguiente/i })).toBeVisible();
  });

  test("can create a full team end-to-end", async ({ page }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");

    await goToStep2(page, "Reikland Reavers", "human");

    // Add 11 Linemen (minimum roster size) from the availability table.
    const addLineman = page.getByRole("button", { name: "Add Lineman" });
    for (let i = 0; i < 11; i++) await addLineman.click();

    // Plantilla table reflects the players with default names.
    await expect(page.getByLabel("Player name for Player 1", { exact: true })).toHaveValue("Player 1");
    await expect(page.getByLabel("Player name for Player 11", { exact: true })).toHaveValue("Player 11");

    // Submit the team.
    await page.getByRole("button", { name: /create team/i }).click();

    // Should redirect to home page and show the team.
    await expect(page).toHaveURL("/");
    await expect(page.getByText("Reikland Reavers")).toBeVisible();
    await expect(page.getByText("Human")).toBeVisible();
  });

  test("rows disappear in Jugadores disponibles once a positional reaches its max", async ({
    page,
  }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");

    await goToStep2(page, "Blitzer Crew", "human");

    // Add 4 Blitzers (human max 4): each click keeps the row visible until max.
    const addBlitzer = page.getByRole("button", { name: "Add Blitzer" });
    await addBlitzer.click();
    await expect(page.getByRole("button", { name: "Add Blitzer" })).toBeVisible();
    await page.getByRole("button", { name: "Add Blitzer" }).click();
    await page.getByRole("button", { name: "Add Blitzer" }).click();
    // After the 4th the row disappears entirely.
    await page.getByRole("button", { name: "Add Blitzer" }).click();
    await expect(page.getByRole("button", { name: "Add Blitzer" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Add Lineman" })).toBeVisible();
  });

  test("shows race change confirmation dialog when roster is not empty", async ({ page }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");

    await goToStep2(page, "Reikland Reavers", "human");
    await page.getByRole("button", { name: "Add Lineman" }).click();

    // Return to step 1 to change race while the roster has players.
    await page.getByRole("button", { name: /editar nombre\/raza/i }).click();
    await page.getByLabel("Race").selectOption("orc");
    await expect(page.getByText(/roster will be cleared/i)).toBeVisible();

    // Cancel keeps the original race and players.
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByLabel("Race")).toHaveValue("human");

    // Try again and confirm.
    await page.getByLabel("Race").selectOption("orc");
    await page.getByRole("button", { name: /confirm/i }).click();
    await expect(page.getByLabel("Race")).toHaveValue("orc");

    // Roster is cleared: advancing to step 2 shows the empty Plantilla.
    await page.getByRole("button", { name: /siguiente/i }).click();
    await expect(page.getByText(/no players in roster yet/i)).toBeVisible();
    // Orc positionals are available.
    await expect(page.getByRole("button", { name: "Add Big Un Blocker" })).toBeVisible();
  });
});

test.describe("Create Team — Roster & Coaching Math (Human)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/teams/create");
    await page.waitForLoadState("networkidle");
    await goToStep2(page, "Reikland Reavers", "human");
    await expect(page.getByRole("region", { name: "Plantilla" })).toBeVisible();
  });

  test("adding players updates count, roster cost, and remaining budget", async ({ page }) => {
    // Initial state: empty roster, full treasury.
    await expect(page.getByText("0 players · 0k / 1,000k gc")).toBeVisible();
    await expect(page.getByText("1,000k remaining")).toBeVisible();

    // Add 3 Linemen (50k each) -> 150k.
    const addLineman = page.getByRole("button", { name: "Add Lineman" });
    await addLineman.click();
    await addLineman.click();
    await addLineman.click();
    await expect(page.getByText("3 players · 150k / 1,000k gc")).toBeVisible();
    await expect(page.getByText("850k remaining")).toBeVisible();

    // Add 1 Blitzer (85k) -> 235k.
    await page.getByRole("button", { name: "Add Blitzer" }).click();
    await expect(page.getByText("4 players · 235k / 1,000k gc")).toBeVisible();
    await expect(page.getByText("765k remaining")).toBeVisible();

    // The availability counter reflects the count for the positional.
    await expect(page.getByText("3/16", { exact: true })).toBeVisible();

    // Roster table reflects the players and totals with default names.
    await expect(page.getByLabel("Player name for Player 1", { exact: true })).toHaveValue("Player 1");
    await expect(page.getByText("4 players", { exact: true })).toBeVisible();
  });

  test("enforces positional maximums and removes a row at the limit", async ({ page }) => {
    // Ogre: max 1 — after adding, the row disappears.
    await page.getByRole("button", { name: "Add Ogre" }).click();
    await expect(page.getByRole("button", { name: "Add Ogre" })).not.toBeVisible();

    // Blitzer: max 4 — after the 4th, the row disappears.
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "Add Blitzer" }).click();
    }
    await expect(page.getByRole("button", { name: "Add Blitzer" })).not.toBeVisible();

    // Roster total after 1 Ogre (140k) + 4 Blitzers (340k) = 480k.
    await expect(page.getByText("5 players · 480k / 1,000k gc")).toBeVisible();
    await expect(page.getByText("520k remaining")).toBeVisible();
  });

  test("removing a player updates count and budget", async ({ page }) => {
    const addLineman = page.getByRole("button", { name: "Add Lineman" });
    await addLineman.click();
    await addLineman.click();
    await page.getByRole("button", { name: "Add Blitzer" }).click();
    // 2 Linemen (100k) + 1 Blitzer (85k) = 185k.
    await expect(page.getByText("3 players · 185k / 1,000k gc")).toBeVisible();
    await expect(page.getByText("815k remaining")).toBeVisible();

    // Remove the first Lineman (default Player 1) -> 135k.
    await page.getByLabel("Player name for Player 1", { exact: true }).fill("Lineman One");
    await page.getByRole("button", { name: "Remove Lineman One", exact: true }).click();
    await expect(page.getByText("2 players · 135k / 1,000k gc")).toBeVisible();
    await expect(page.getByText("865k remaining")).toBeVisible();
  });

  test("coaching purchases update the coaching total correctly", async ({ page }) => {
    const coachingSection = page.getByRole("region", { name: "Coaching Staff" });
    await expect(coachingSection).toBeVisible();

    // Dedicated Fans start at 1 and are free -> total starts at 0.
    await expect(coachingSection.getByText("0k gc", { exact: true })).toBeVisible();

    // 2 Rerolls x 50k = 100k.
    await page.getByLabel("Rerolls").fill("2");
    await expect(coachingSection.getByText("100k gc", { exact: true })).toBeVisible();

    // +3 Assistant Coaches x 10k = 30k -> 130k.
    await page.getByLabel("Assistant Coaches").fill("3");
    await expect(coachingSection.getByText("130k gc", { exact: true })).toBeVisible();

    // +2 Cheerleaders x 10k = 20k -> 150k.
    await page.getByLabel("Cheerleaders").fill("2");
    await expect(coachingSection.getByText("150k gc", { exact: true })).toBeVisible();

    // Dedicated Fans 3 = 2 upgrades x 5k = 10k -> 160k.
    await page.getByLabel("Dedicated Fans").fill("3");
    await expect(coachingSection.getByText("160k gc", { exact: true })).toBeVisible();

    // + Apothecary 50k -> 210k.
    await page.getByLabel("Apothecary").check();
    await expect(coachingSection.getByText("210k gc", { exact: true })).toBeVisible();
  });

  test("roster and coaching costs combine into the team total", async ({ page }) => {
    // 3 Linemen (150k) + 1 Blitzer (85k) = 235k roster.
    const addLineman = page.getByRole("button", { name: "Add Lineman" });
    await addLineman.click();
    await addLineman.click();
    await addLineman.click();
    await page.getByRole("button", { name: "Add Blitzer" }).click();
    await expect(page.getByText("4 players · 235k / 1,000k gc")).toBeVisible();

    // Coaching: 2 Rerolls (100k) + Apothecary (50k) = 150k.
    await page.getByLabel("Rerolls").fill("2");
    await page.getByLabel("Apothecary").check();
    const coachingSection = page.getByRole("region", { name: "Coaching Staff" });
    await expect(coachingSection.getByText("150k gc", { exact: true })).toBeVisible();

    // Team total = 235k + 150k = 385k -> 615k remaining.
    await expect(page.getByText("4 players · 385k / 1,000k gc")).toBeVisible();
    await expect(page.getByText("615k remaining")).toBeVisible();
  });

  test("going over budget with coaching blocks submission with an error", async ({ page }) => {
    // Roster: 4 Blitzers (340k) + Ogre (140k) + Lineman (50k) = 530k.
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "Add Blitzer" }).click();
    }
    await page.getByRole("button", { name: "Add Ogre" }).click();
    await page.getByRole("button", { name: "Add Lineman" }).click();
    await expect(page.getByText("6 players · 530k / 1,000k gc")).toBeVisible();

    // Coaching max: 8 Rerolls (400k) + 6 Assistants (60k) + 6 Cheerleaders (60k)
    // + 2 fan upgrades (10k) + Apothecary (50k) = 580k.
    await page.getByLabel("Rerolls").fill("8");
    await page.getByLabel("Assistant Coaches").fill("6");
    await page.getByLabel("Cheerleaders").fill("6");
    await page.getByLabel("Dedicated Fans").fill("3");
    await page.getByLabel("Apothecary").check();

    // 530k + 580k = 1,110k -> over budget by 110k.
    await expect(page.getByText("Over budget by 110k")).toBeVisible();

    await page.getByRole("button", { name: "Create Team" }).click();
    await expect(page.getByText("Roster exceeds the 1,000,000 gc budget")).toBeVisible();
    // No redirect: still on the create page.
    await expect(page).toHaveURL(/\/teams\/create$/);
  });
});
