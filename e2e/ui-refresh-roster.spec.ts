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
 *     (flag OFF is the default, no flash of V2);
 *  4. mobile (UIR-4): the same cookie at an inline 390×844 viewport → the V2
 *     roster renders as stacked `ui-v2-roster-card-*` player cards and neither
 *     the legacy table nor the desktop V2 table is mounted. The viewport is set
 *     inline because the Playwright `mobile` project's `testMatch` only covers
 *     `mobile.spec.ts` — playwright.config.ts is deliberately untouched;
 *  5. `/teams` desktop (task 1.4, second declared seam): `bb-ui=next` → the
 *     V2 list skeleton (`ui-v2-teams-grid`) is visible and the legacy
 *     `#teams-unassigned-heading` id is absent (never both, UIR-2);
 *  6. list triangulation (UIR-1 / UIR-4): `bb-ui=legacy` AND no cookie at
 *     all → the legacy list heading renders and `ui-v2-teams-*` count is 0;
 *  7. `/teams` mobile (task 2.3, UIR-4): the same cookie at an inline
 *     390×844 viewport → stacked `ui-v2-teams-card-*` cards, the sticky
 *     `ui-v2-teams-create-cta` (Stitch "M 05") visible, and every legacy
 *     list marker count 0;
 *  8. delete parity flag ON (task 2.5): the V2 card delete control opens the
 *     reused `TeamDeleteModal` with the Spanish copy and confirming removes
 *     the team through the store channel (empty state takes over).
 *  9. `/` desktop (task 1.4, third declared seam): `bb-ui=next` → the V2
 *     dashboard surface (`ui-v2-dashboard-*`) is visible — including the
 *     "ready to improve" link the helpers above click — and the legacy
 *     `#dashboard-teams-heading` id is absent (never both, UIR-2);
 * 10. dashboard triangulation (UIR-1 / UIR-4): `bb-ui=legacy` AND no cookie
 *     at all → the legacy dashboard heading renders and `ui-v2-dashboard-*`
 *     count is 0;
 * 11. `/` mobile (task 2.3, UIR-4): the same cookie at an inline 390×844
 *     viewport → the stacked V2 dashboard zones (stats, teams, leagues) are
 *     visible and every legacy dashboard marker count is 0.
 *
 * 11. `/teams/create` desktop (task 1.4, fourth declared seam): `bb-ui=next`
 *     → the V2 wizard (`ui-v2-create-step1`) is visible and the legacy
 *     `#team-name` id is absent (never both, UIR-2). Every flag-ON test above
 *     already walks this seam through the UNEDITED `createTeamAndOpenList`
 *     helper — that is the harness contract the V2 preserves.
 * 12. wizard triangulation (UIR-1 / UIR-4): `bb-ui=legacy` AND no cookie at
 *     all → the legacy wizard input renders and `ui-v2-create-*` count is 0.
 * 13. `/leagues` desktop (task 1.4, fifth declared seam): `bb-ui=next` → the
 *     V2 hero (`ui-v2-leagues-hero`) is visible and the legacy
 *     `#leagues-heading` id is absent (never both, UIR-2). No helper walks
 *     this route — cookie set, then goto directly (design.md S7: traced,
 *     `createTeamAndOpenList` never reaches `/leagues`).
 * 14. leagues triangulation (UIR-1 / UIR-4): `bb-ui=legacy` AND no cookie at
 *     all → the legacy hero renders and `ui-v2-leagues-*` count is 0.
 * 15. `/leagues` mobile (task 2.3, UIR-4): the same cookie at an inline
 *     390×844 viewport → the V2 hero + zones render stacked on the narrow
 *     width and every legacy leagues marker count is 0.
 * 16. fixture desktop (task 1.4, sixth declared seam): `bb-ui=next` → the V2
 *     surface zone (`ui-v2-match-error` on this suite's anonymous 401) is
 *     visible and the legacy loaded-state testids are absent. Never-both
 *     proof: the legacy error panel carries NO testid, so
 *     `getByText("Unauthorized")` — strict, single match — means exactly one
 *     surface mounted. No helper walks this route (design.md S7): cookie,
 *     then goto directly.
 * 17. fixture triangulation (UIR-1 / UIR-4): `bb-ui=legacy` AND no cookie at
 *     all → the legacy error panel renders and `ui-v2-match-*` count is 0.
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
 * local-suite default) and walks CLIENT-SIDE to the team list (`/teams`).
 */
async function createTeamAndOpenList(page: Page, teamName: string) {
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
}

/**
 * The wizard team walked to its detail page (client-side from the list, so
 * the tab-session store survives).
 */
async function createTeamAndOpenDetail(page: Page, teamName: string) {
  await createTeamAndOpenList(page, teamName);
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

test("flag ON at a mobile viewport: stacked V2 cards replace both tables", async ({
  page,
}) => {
  // Inline viewport + cookie BEFORE the first goto. The `mobile` Playwright
  // project only matches mobile.spec.ts, so this desktop-project spec opts
  // into the mobile width itself (task 3.4) without touching any config.
  await page.setViewportSize({ width: 390, height: 844 });
  await setUiFlag(page, "next");
  await createTeamAndOpenDetail(page, "V2 Mobile Team");

  await expect(page.getByTestId("ui-v2-roster")).toBeVisible();
  // Stacked player cards, not the desktop ruled table (RosterV2's useIsDesktop
  // branch flips on hydration with the 768px breakpoint).
  await expect(
    page.locator('[data-testid^="ui-v2-roster-card-"]').first(),
  ).toBeVisible();
  await expect(page.locator('[data-testid^="ui-v2-roster-row-"]')).toHaveCount(0);
  await expect(page.getByTestId("ui-v2-roster-table")).toHaveCount(0);
  // Never the legacy surface (UIR-2: never both).
  await expect(page.getByTestId("team-roster-table")).toHaveCount(0);
});

test("flag ON (bb-ui=next): the teams list seam renders the V2 surface", async ({
  page,
}) => {
  await setUiFlag(page, "next");
  await createTeamAndOpenList(page, "V2 List Team");

  // V2 vocabulary (task 1.3): ui-v2-teams-* only — the legacy section
  // heading id must never be mounted alongside (never both, UIR-2).
  await expect(page.getByTestId("ui-v2-teams-grid")).toBeVisible();
  await expect(page.locator("#teams-unassigned-heading")).toHaveCount(0);
});

test("flag ON at a mobile viewport: the teams list renders stacked V2 cards", async ({
  page,
}) => {
  // Inline viewport + cookie BEFORE the first goto (task 2.3): the `mobile`
  // Playwright project only matches mobile.spec.ts, so this desktop-project
  // spec opts into the 390×844 width itself without touching any config.
  await page.setViewportSize({ width: 390, height: 844 });
  await setUiFlag(page, "next");
  await createTeamAndOpenList(page, "V2 Mobile List Team");

  // Stacked cards (Tailwind grid falls to one column below 640px) and the
  // sticky bottom create CTA from Stitch "M 05".
  await expect(page.getByTestId("ui-v2-teams-grid")).toBeVisible();
  await expect(
    page.locator('[data-testid^="ui-v2-teams-card-"]').first(),
  ).toBeVisible();
  await expect(page.getByTestId("ui-v2-teams-create-cta")).toBeVisible();
  // Never the legacy surface: every legacy list marker count is 0 (UIR-2).
  await expect(page.locator("#teams-unassigned-heading")).toHaveCount(0);
  await expect(page.locator('[data-testid="team-ctv"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="team-treasury"]')).toHaveCount(0);
});

test("flag ON (bb-ui=next): card delete opens the modal and removes the team", async ({
  page,
}) => {
  await setUiFlag(page, "next");
  await createTeamAndOpenList(page, "V2 Delete Team");

  // Same accessible name convention as the legacy TeamCard control (the
  // reused TeamDeleteModal keeps its hardcoded Spanish copy in every locale).
  await page.getByRole("button", { name: "Eliminar V2 Delete Team" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByText(/Esta acción no se puede deshacer/i)).toBeVisible();

  // exact: the card buttons share the "Eliminar" prefix in their names.
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();

  // The store channel removed the team (persists for the tab session) and the
  // empty state takes over.
  await expect(page.locator('[data-testid^="ui-v2-teams-card-"]')).toHaveCount(0);
  await expect(page.getByTestId("ui-v2-teams-empty")).toBeVisible();
  await expect(dialog).not.toBeVisible();
});

test("flag OFF via bb-ui=legacy: the legacy teams list renders (triangulation)", async ({
  page,
}) => {
  await setUiFlag(page, "legacy");
  await createTeamAndOpenList(page, "Legacy List Team");

  await expect(page.locator("#teams-unassigned-heading")).toBeVisible();
  await expect(page.locator('[data-testid^="ui-v2-teams-"]')).toHaveCount(0);
});

test("flag OFF with no cookie: the legacy teams list renders (default)", async ({
  page,
}) => {
  // No addCookies at all — absent cookie MUST resolve OFF (UIR-1).
  await createTeamAndOpenList(page, "No Flag List Team");

  await expect(page.locator("#teams-unassigned-heading")).toBeVisible();
  await expect(page.locator('[data-testid^="ui-v2-teams-"]')).toHaveCount(0);
});

test("flag ON (bb-ui=next): the dashboard seam renders the V2 surface", async ({
  page,
}) => {
  await setUiFlag(page, "next");
  await page.goto("/");

  // V2 vocabulary (task 1.4): ui-v2-dashboard-* only — the legacy section
  // heading id must never be mounted alongside (never both, UIR-2).
  await expect(page.getByTestId("ui-v2-dashboard-teams")).toBeVisible();
  await expect(page.locator("#dashboard-teams-heading")).toHaveCount(0);
  // The harness contract the flag-ON helpers above depend on: the surface
  // keeps the "ready to improve" summary link navigating to /teams.
  await expect(
    page.getByRole("link", { name: /ready to improve/i }),
  ).toBeVisible();
});

test("flag ON at a mobile viewport: the dashboard renders stacked V2 zones", async ({
  page,
}) => {
  // Inline viewport + cookie BEFORE the first goto (task 2.3): the `mobile`
  // Playwright project only matches mobile.spec.ts, so this desktop-project
  // spec opts into the 390×844 width itself without touching any config.
  await page.setViewportSize({ width: 390, height: 844 });
  await setUiFlag(page, "next");
  await page.goto("/");

  // Stacked zones (Tailwind grid falls to one column below the breakpoints):
  // stats, teams and leagues landmarks are all visible on the narrow width.
  await expect(page.getByTestId("ui-v2-dashboard-stats")).toBeVisible();
  await expect(page.getByTestId("ui-v2-dashboard-teams")).toBeVisible();
  await expect(page.getByTestId("ui-v2-dashboard-leagues")).toBeVisible();
  // Never the legacy surface: every legacy dashboard marker count is 0 (UIR-2).
  await expect(page.locator("#dashboard-teams-heading")).toHaveCount(0);
  await expect(page.locator("#dashboard-next-match-heading")).toHaveCount(0);
  await expect(page.locator("#dashboard-leagues-heading")).toHaveCount(0);
  await expect(page.locator('[aria-label="Overview"]')).toHaveCount(0);
  await expect(page.locator('[aria-label="Quick actions"]')).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /ready to improve/i }),
  ).toBeVisible();
});

test("flag OFF via bb-ui=legacy: the legacy dashboard renders (triangulation)", async ({
  page,
}) => {
  await setUiFlag(page, "legacy");
  await page.goto("/");

  await expect(page.locator("#dashboard-teams-heading")).toBeVisible();
  await expect(page.locator('[data-testid^="ui-v2-dashboard-"]')).toHaveCount(0);
});

test("flag OFF with no cookie: the legacy dashboard renders (default)", async ({
  page,
}) => {
  // No addCookies at all — absent cookie MUST resolve OFF (UIR-1).
  await page.goto("/");

  await expect(page.locator("#dashboard-teams-heading")).toBeVisible();
  await expect(page.locator('[data-testid^="ui-v2-dashboard-"]')).toHaveCount(0);
});

test("flag ON (bb-ui=next): the create wizard seam renders the V2 surface", async ({
  page,
}) => {
  await setUiFlag(page, "next");
  await page.goto("/teams/create");
  await page.waitForLoadState("networkidle");

  // V2 vocabulary (task 1.4): ui-v2-create-* only — the legacy step-1 input
  // id must never be mounted alongside (never both, UIR-2).
  await expect(page.getByTestId("ui-v2-create-step1")).toBeVisible();
  await expect(page.locator("#team-name")).toHaveCount(0);
  // The harness contract: the accessible names createTeamAndOpenList
  // resolves (labels + "Next →") stay resolvable on the V2 surface.
  await expect(page.getByLabel("Team name", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Race")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next →" })).toBeVisible();
});

test("flag OFF via bb-ui=legacy: the legacy wizard renders (triangulation)", async ({
  page,
}) => {
  await setUiFlag(page, "legacy");
  await page.goto("/teams/create");
  await page.waitForLoadState("networkidle");

  await expect(page.locator("#team-name")).toBeVisible();
  await expect(page.locator('[data-testid^="ui-v2-create-"]')).toHaveCount(0);
});

test("flag OFF with no cookie: the legacy wizard renders (default)", async ({
  page,
}) => {
  // No addCookies at all — absent cookie MUST resolve OFF (UIR-1).
  await page.goto("/teams/create");
  await page.waitForLoadState("networkidle");

  await expect(page.locator("#team-name")).toBeVisible();
  await expect(page.locator('[data-testid^="ui-v2-create-"]')).toHaveCount(0);
});

test("flag ON at a mobile viewport: the create wizard renders stacked V2 zones", async ({
  page,
}) => {
  // Inline viewport + cookie BEFORE the first goto (task 2.3): the `mobile`
  // Playwright project only matches mobile.spec.ts, so this desktop-project
  // spec opts into the 390×844 width itself without touching any config.
  await page.setViewportSize({ width: 390, height: 844 });
  await setUiFlag(page, "next");
  await page.goto("/teams/create");
  await page.waitForLoadState("networkidle");

  // Stepper + step-1 landmarks stack on the narrow width (Stitch "M 06").
  await expect(page.getByTestId("ui-v2-create-step1")).toBeVisible();
  await expect(page.getByTestId("ui-v2-create-stepper")).toBeVisible();
  await expect(page.getByTestId("ui-v2-create-treasury")).toBeVisible();
  // Never the legacy surface: every legacy wizard marker count is 0 (UIR-2).
  await expect(page.locator("#team-name")).toHaveCount(0);
  await expect(page.locator("#team-race")).toHaveCount(0);

  // Walk to step 2: the coaching zone (parity with legacy) is visible too.
  await page.getByLabel("Team name", { exact: true }).fill("Mobile V2 Team");
  await page.getByLabel("Race").selectOption("human");
  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.getByTestId("ui-v2-create-step2")).toBeVisible();
  await expect(page.getByTestId("ui-v2-create-coaching")).toBeVisible();
  await expect(page.locator('[data-testid^="ui-v2-create-"]').first()).toBeVisible();
});

test("flag ON (bb-ui=next): the leagues list seam renders the V2 surface", async ({
  page,
}) => {
  await setUiFlag(page, "next");
  await page.goto("/leagues");

  // V2 vocabulary (task 1.4): ui-v2-leagues-* only — the legacy hero id must
  // never be mounted alongside (never both, UIR-2). No helper walks this
  // route (design.md S7): cookie, then goto directly.
  await expect(page.getByTestId("ui-v2-leagues-hero")).toBeVisible();
  await expect(page.locator("#leagues-heading")).toHaveCount(0);
  await expect(page.locator("#my-leagues-heading")).toHaveCount(0);
  // AUTH_MODE=local is anonymous: GET /api/leagues answers 401, so the V2
  // renders its ERROR zone (same data channel as legacy — the observed
  // behavior of the legacy surface too, whose error panel shows the same
  // message). The empty state is covered by the component test.
  await expect(page.getByTestId("ui-v2-leagues-error")).toBeVisible();
  await expect(page.getByText("Unauthorized")).toBeVisible();
});

test("flag OFF via bb-ui=legacy: the legacy leagues list renders (triangulation)", async ({
  page,
}) => {
  await setUiFlag(page, "legacy");
  await page.goto("/leagues");

  await expect(page.locator("#leagues-heading")).toBeVisible();
  await expect(page.locator('[data-testid^="ui-v2-leagues-"]')).toHaveCount(0);
});

test("flag ON at a mobile viewport: the leagues list renders the stacked V2 surface", async ({
  page,
}) => {
  // Inline viewport + cookie BEFORE the first goto (task 2.3): the `mobile`
  // Playwright project only matches mobile.spec.ts, so this desktop-project
  // spec opts into the 390×844 width itself without touching any config.
  await page.setViewportSize({ width: 390, height: 844 });
  await setUiFlag(page, "next");
  await page.goto("/leagues");

  // V2 vocabulary on the narrow width (M 09): hero + zones stacked, never
  // the legacy markers (never both, UIR-2).
  await expect(page.getByTestId("ui-v2-leagues-hero")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Nueva liga|New league/ }),
  ).toBeVisible();
  await expect(page.locator("#leagues-heading")).toHaveCount(0);
  await expect(page.locator("#my-leagues-heading")).toHaveCount(0);
  await expect(page.locator("#open-leagues-heading")).toHaveCount(0);
  await expect(page.locator('[data-testid^="ui-v2-leagues-"]')).not.toHaveCount(0);
  // The hero must not force a horizontal scrollbar at 390px.
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});

test("flag OFF with no cookie: the legacy leagues list renders (default)", async ({
  page,
}) => {
  // No addCookies at all — absent cookie MUST resolve OFF (UIR-1).
  await page.goto("/leagues");

  await expect(page.locator("#leagues-heading")).toBeVisible();
  await expect(page.locator('[data-testid^="ui-v2-leagues-"]')).toHaveCount(0);
});

test("flag ON (bb-ui=next): the live match seam renders the V2 surface", async ({
  page,
}) => {
  await setUiFlag(page, "next");
  await page.goto("/leagues/l1/fixtures/f1");

  // V2 vocabulary (task 1.4): ui-v2-match-* only. AUTH_MODE=local is
  // anonymous: the fixture GET validates auth() BEFORE the lookup (route.ts),
  // so it answers 401 — the skeleton renders its ERROR zone through the SAME
  // data channel legacy uses (seam-5 precedent: ui-v2-leagues-error).
  await expect(page.getByTestId("ui-v2-match-error")).toBeVisible();
  await expect(page.getByText("Unauthorized")).toBeVisible();
  // Never both (UIR-2): the legacy error panel has no testid, so the strict
  // single-match assertion above IS the never-both proof (two surfaces → two
  // "Unauthorized" panels → strict violation). Loaded-state legacy testids
  // must be absent as well.
  await expect(page.locator('[data-testid="rulebook-header"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="share-link"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="mini-strip"]')).toHaveCount(0);
});

test("flag OFF via bb-ui=legacy: the legacy live match renders (triangulation)", async ({
  page,
}) => {
  await setUiFlag(page, "legacy");
  await page.goto("/leagues/l1/fixtures/f1");

  // Same channel, other surface: the legacy error panel renders (strict
  // single match) and no V2 marker exists.
  await expect(page.getByText("Unauthorized")).toBeVisible();
  await expect(page.locator('[data-testid^="ui-v2-match-"]')).toHaveCount(0);
});

test("flag OFF with no cookie: the legacy live match renders (default)", async ({
  page,
}) => {
  // No addCookies at all — absent cookie MUST resolve OFF (UIR-1).
  await page.goto("/leagues/l1/fixtures/f1");

  await expect(page.getByText("Unauthorized")).toBeVisible();
  await expect(page.locator('[data-testid^="ui-v2-match-"]')).toHaveCount(0);
});
