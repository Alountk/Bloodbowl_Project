import { test, expect, type Page } from "@playwright/test";

/**
 * ui-refresh flag-ON e2e (UIR-2 / UIR-4), AUTH_MODE=local — this spec is part
 * of the default chromium project and is intentionally NOT added to any
 * `testIgnore` list in playwright.config.ts.
 *
 * Pins:
 *
 *  1. `bb-ui=next` (set via `page.context().addCookies` BEFORE the first goto,
 *     pattern `e2e/locale.spec.ts:69`) → the team detail seam renders the V2
 *     surface: the `ui-v2-*` vocabulary (task 2.1) is visible and the legacy
 *     `team-roster-table` marker is absent (never both surfaces, UIR-2);
 *  2. triangulation (UIR-1 / UIR-4): `bb-ui=legacy` → legacy surface only
 *     (`team-roster-table` present, `ui-v2-roster` absent);
 *  3. triangulation (UIR-1 default): no `bb-ui` cookie at all → legacy surface
 *     (flag OFF is the default, no flash of V2).
 *
 * The team is established through the local-mode wizard pattern: AUTH_MODE=local
 * keeps teams in a shared in-memory store, so every navigation AFTER the team
 * is created is client-side — a full reload would wipe the tab-session store
 * (same constraint as `e2e/delete-team.spec.ts`).
 */
test.setTimeout(180_000);

/** Sets the `bb-ui` flag cookie for the current origin (locale.spec.ts:69 pattern). */
async function setUiFlag(page: Page, value: string) {
  await page.context().addCookies([
    { name: "bb-ui", value, url: "http://localhost:3000" },
  ]);
}

/**
 * Creates an 11-player human team through the wizard (English labels, the
 * local-suite default) and walks CLIENT-SIDE to its detail page.
 */
async function createTeamAndOpenDetail(page: Page, teamName: string) {
  await page.goto("/teams/create");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Team name", { exact: true }).fill(teamName);
  await page.getByLabel("Race").selectOption("human");
  await page.getByRole("button", { name: "Next →" }).click();

  // BB2025 minimum roster: 11 linemen (create-team.spec.ts pattern).
  const addLineman = page.getByRole("button", { name: "Add Human Lineman" }).first();
  for (let i = 0; i < 11; i++) await addLineman.click();

  await page.getByRole("button", { name: /create team/i }).click();
  await expect(page).toHaveURL("/");

  // Client-side navigation only from here: the local store dies on reload.
  await page.getByRole("link", { name: /ready to improve/i }).click();
  await expect(page).toHaveURL(/\/teams$/);
  await page.getByRole("link", { name: teamName }).click();
  await expect(page).toHaveURL(/\/teams\/.+$/);
}

test("flag ON (bb-ui=next): the team detail seam renders the V2 surface", async ({
  page,
}) => {
  await setUiFlag(page, "next");
  await createTeamAndOpenDetail(page, "V2 Roster Team");

  // V2 vocabulary (task 2.1): ui-v2-* markers only — legacy testid names are
  // never reused in V2, so `team-roster-table` must not be mounted alongside.
  await expect(page.getByTestId("ui-v2-hero")).toBeVisible();
  await expect(page.getByTestId("ui-v2-coaching")).toBeVisible();
  await expect(page.getByTestId("ui-v2-treasury")).toBeVisible();
  await expect(page.getByTestId("ui-v2-roster")).toBeVisible();
  await expect(page.getByTestId("team-roster-table")).toHaveCount(0);
});

test("flag OFF via bb-ui=legacy: the legacy surface renders (triangulation)", async ({
  page,
}) => {
  await setUiFlag(page, "legacy");
  await createTeamAndOpenDetail(page, "Legacy Roster Team");

  await expect(page.getByTestId("team-roster-table")).toHaveCount(1);
  await expect(page.getByTestId("ui-v2-roster")).toHaveCount(0);
});

test("flag OFF with no cookie: the legacy surface renders (default)", async ({
  page,
}) => {
  // No addCookies at all — absent cookie MUST resolve OFF (UIR-1).
  await createTeamAndOpenDetail(page, "No Flag Team");

  await expect(page.getByTestId("team-roster-table")).toHaveCount(1);
  await expect(page.getByTestId("ui-v2-roster")).toHaveCount(0);
});
