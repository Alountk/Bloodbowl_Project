import { test, expect as baseExpect, type Page } from "@playwright/test";
import { E2E_VERIFICATION_CODE } from "./verificationCode";
test.use({ locale: "es-ES" });

/**
 * Full match journey E2E (odd/tasks/full-match-journey.md): ONE test that walks
 * the ENTIRE lifecycle through the real UI, from zero coaches to the final
 * "Jornada completa" screen, with the result persisting after a reload.
 *
 * Stages (one `test.step` each):
 *   1. Sign up 2 coaches (the #197 6-digit emailed-code step, exact helper
 *      pattern from the auth-suite specs).
 *   2. Draft BOTH teams through the create-team wizard (11 players each; the
 *      rival is richer — 9 linemen + 2 blitzers — so a lower-TV side exists for
 *      the ready-phase inducement step).
 *   3. Create the league, assign both teams, start a 1-jornada season — UI.
 *   4. Propose + accept the fixture date through the negotiation dialog — UI.
 *   5. Consent ×2 ("Iniciar partido"), the lower-TV coach confirms the
 *      inducements, "Empezar partido" → kick-off feed visible.
 *   6. Play every turn of Mitad 1 through the dock ("Dar el turno" → reason
 *      chip, plus one "Pedir turno" nudge) — 16 turn slots — and assert the
 *      rulebook header flips to Mitad 2.
 *   7. Play Mitad 2 up to Turno 8 through the dock.
 *   8. Score a TD via the dock in Mitad 2 Turno 8 → the match auto-finishes
 *      (D5). NEVER `endMatch` — that command is API-only and forbidden here.
 *   9. Drive the 5-step resolve wizard ×2 coaches (Winnings → Fans 1D6 → MVP →
 *      Casualties → Journeymen) through the modal.
 *  10. "Jornada completa": the result on the match view + the league marcador,
 *      both still there after a reload.
 *
 * NO test-side API calls: no `page.request`, no `request.post`, no fetch, no
 * `page.evaluate` commands. Every stage navigates and clicks like a coach, and
 * cross-page state is read from the DOM (rulebook header, docks, match cards).
 *
 * Environment note: the journey needs the session-backed backend — signup
 * verification (fixed code via E2E_VERIFICATION_CODE) plus the leagues/live
 * APIs, which answer 401 without a session. That is the AUTH_MODE=auth app the
 * auth Playwright config boots; a cold AUTH_MODE=local server has no session
 * path (signup skips the code screen, /api/leagues 401s) and cannot host it.
 */

// The full lifecycle (2 bcrypt signups, two 11-player wizard drafts, ~30 dock
// passes with SSE convergence, and both sides of the resolve wizard) far
// exceeds Playwright's 30s default — give it an explicit generous budget.
test.setTimeout(900_000);

// The local suite boots `next dev` with the default 5s expect timeout, which is
// too tight for this journey's cold first hits (route compilation + SSE fan-out
// waits). Raise the per-assertion budget file-wide; `tight()` bounds actions.
const expect = baseExpect.configure({ timeout: 20_000 });

const PASSWORD = "password-123";
const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

/** Applies a tight action timeout so a hung step fails fast with a clear locator. */
function tight(page: Page) {
  page.setDefaultTimeout(30_000);
  return page;
}

/** Signs up a coach and lands on the home page with an active session — the
 *  exact auth-suite helper (issue #197: enter the mailed 6-digit code). */
async function signup(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByLabel("Nombre").fill("Entrenador E2E");
  await page.getByRole("button", { name: "Registrarse" }).last().click();
  await page.getByLabel("Código de verificación").fill(E2E_VERIFICATION_CODE);
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page).toHaveURL("/");
}

/** Drafts a HUMAN team through the wizard. `blitzers` (0..2) raises the roster
 *  cost vs 11 linemen — the richer draft makes the rival the higher-TV side. */
async function createTeam(page: Page, name: string, blitzers = 0) {
  await page.goto("/teams/create");
  await page.getByLabel("Nombre del equipo").fill(name);
  await page.getByLabel("Raza").selectOption("human");
  await page.getByRole("button", { name: "Siguiente →" }).click();
  const addLineman = page.getByRole("button", { name: "Añadir Human Lineman" }).first();
  for (let i = 0; i < 11 - blitzers; i++) await addLineman.click();
  if (blitzers > 0) {
    const addBlitzer = page.getByRole("button", { name: "Añadir Human Blitzer" }).first();
    for (let i = 0; i < blitzers; i++) await addBlitzer.click();
  }
  await page.getByRole("button", { name: /crear equipo/i }).click();
  await expect(page).toHaveURL("/");
  // The home shows only a summary now (#268): confirm the card on /teams.
  await page.goto("/teams");
  await expect(page.getByText(name)).toBeVisible();
}

/** Opens the league card from the list and returns its detail URL (UI-derived:
 *  the URL comes from the address bar, never from an API call). */
async function openLeagueCard(page: Page, leagueName: string): Promise<string> {
  await page
    .locator("li")
    .filter({ hasText: leagueName })
    .getByRole("link", { name: "Ver", exact: true })
    .click({ force: true });
  await expect(page).toHaveURL(/\/leagues\/.+$/);
  return page.url();
}

/** Builds a unique slot (local time) plus its es-ES label for assertions. */
function futureSlot(
  daysAhead: number,
  hours: number,
  minutes: number,
): { dateInput: string; esLabel: string; esRegex: RegExp } {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hours, minutes, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const esLabel = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return {
    dateInput: `${y}-${m}-${day}`,
    esLabel,
    esRegex: new RegExp(`${day}/${m}/${y}, ${hh}:${mm}`),
  };
}

/** rulebook card: the CENTER SCORE (or its negotiate affordance) opens the
 *  negotiation dialog — the exact pattern the matchday suite drives. */
async function openNegotiation(page: Page) {
  await page.getByRole("region", { name: "Jornada 1" }).getByTestId("match-card-score").click();
}

const negotiationDialog = (page: Page) => page.getByRole("dialog", { name: /Acordar fecha/ });

/** Proposes a date+time from an open negotiation dialog. */
async function proposeInDialog(page: Page, dateInput: string, timeInput: string) {
  const dialog = negotiationDialog(page);
  await dialog.getByLabel("Fecha propuesta").fill(dateInput);
  await dialog.getByLabel("Hora propuesta").fill(timeInput);
  await dialog.getByRole("button", { name: "Proponer" }).click();
}

/** Reads the rulebook header's "Mitad H · Turno N" chip on a coach's page. */
async function halfTurn(page: Page): Promise<string> {
  const chip = page.getByTestId("rulebook-header").getByText(/^Mitad [12] · Turno [1-8]$/);
  await expect(chip).toBeVisible();
  return ((await chip.textContent()) ?? "").trim();
}

/** The coach whose dock currently offers the pass-turn action (the active side;
 *  exactly one of the two holds it at any settled point of the match). Locators
 *  cannot span two pages (`or()` is frame-scoped), so the XOR is polled across
 *  both DOMs and then read back — no state flip happens between our own passes. */
async function activeCoach(a: Page, b: Page): Promise<Page> {
  const holds = async (page: Page) =>
    (await page.getByRole("button", { name: "Dar el turno" }).count()) > 0;
  await expect
    .poll(
      async () => {
        const aHolds = await holds(a);
        const bHolds = await holds(b);
        return aHolds !== bHolds;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return (await holds(a)) ? a : b;
}

/** One turn through the dock: "Dar el turno" → reason chip (auto-fires) → wait
 *  until the pass LANDED. A normal pass swaps the active side (the passer loses
 *  "Dar el turno", the rival gains it), but the half-1 → half-2 boundary does
 *  NOT: away Turno 8 hands over to away Turno 1 of the new half with the same
 *  coach still active — there the header chip advancing is the only observable
 *  change, so the poll accepts either signal. */
async function passTurn(from: Page, to: Page) {
  const chipBefore = await halfTurn(from);
  const pass = from.getByRole("button", { name: "Dar el turno" });
  await expect(pass).toBeVisible();
  await pass.click();
  const modal = from.getByTestId("live-action-modal");
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Voluntario" }).click();
  await expect(modal).toHaveCount(0);
  await expect
    .poll(
      async () => {
        const chipNow = await halfTurn(from);
        if (chipNow !== chipBefore) return true; // round/half advanced
        const fromHolds =
          (await from.getByRole("button", { name: "Dar el turno" }).count()) > 0;
        const toHolds = (await to.getByRole("button", { name: "Dar el turno" }).count()) > 0;
        return !fromHolds && toHolds; // active side swapped
      },
      { timeout: 20_000 },
    )
    .toBe(true);
}

// --- Action-dock helpers (Design A, copied from live-match.spec.ts) ----------

function actionDock(page: Page) {
  return page.getByTestId("live-action-dock");
}

/** Opens the dock sheet for the coach's given action (matched by name). */
async function openDockAction(
  page: Page,
  actionName: string,
): Promise<ReturnType<Page["getByTestId"]>> {
  const dock = actionDock(page);
  await expect(dock).toBeVisible();
  await dock.getByRole("button", { name: new RegExp(actionName, "i") }).click();
  const sheet = dock.getByTestId("live-action-modal");
  await expect(sheet).toBeVisible();
  return dock;
}

/** Taps the coach's Nth OWN dorsal chip currently offered by the sheet pool. */
async function dockTapOwn(page: Page, ownIndex: number) {
  const dock = actionDock(page);
  const pool = dock.getByTestId("dock-pool-own");
  await expect(pool).toBeVisible();
  const chip = pool.getByTestId("dock-player-own").nth(ownIndex);
  await expect(chip).toBeVisible();
  await chip.click();
}

/**
 * Two-touch TD from the dock: action → the coach's OWN player chip, which fires
 * the command instantly and closes the sheet (no roll stages).
 */
async function dockScoredAction(page: Page, actionName: string, ownIndex: number) {
  await openDockAction(page, actionName);
  await dockTapOwn(page, ownIndex);
  await expect(actionDock(page).getByTestId("live-action-modal")).toHaveCount(0);
}

// --- Resolve-wizard helpers (RAU-52, UI parts only — no liveCommand API) ----

/** Opens the resolution modal (auto-open tolerant) on a coach's OWN page. */
async function openResolution(page: Page, matchUrl: string) {
  await page.goto(matchUrl);
  const dialog = page.getByRole("dialog", { name: "Resolver partido" });
  try {
    await dialog.waitFor({ state: "visible", timeout: 8_000 });
  } catch {
    await page.getByRole("button", { name: "Reanudar" }).click();
    await expect(dialog).toBeVisible();
  }
  return dialog;
}

/**
 * Drives a coach's OWN side through steps 1–3 (winnings → fans → MVP),
 * independent of the rival: the server-owned 1D6 fan roll, the six checkbox
 * nominations + the SEND + the FINAL confirm (irrevocable).
 * Returns the dialog (now at the "mvp-done" waiting step).
 */
async function driveWinningsFansMvp(page: Page, matchUrl: string) {
  const dialog = await openResolution(page, matchUrl);
  await expect(dialog.getByText("Paso: Ganancias y mantenimiento")).toBeVisible({ timeout: 25_000 });
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.getByText("Paso: Tirada de fans")).toBeVisible({ timeout: 25_000 });
  await dialog.getByRole("button", { name: "Tirar 1D6" }).click();
  await expect(dialog.getByText(/factor fan/)).toBeVisible();
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.getByText("Paso: Nominaciones al MVP")).toBeVisible({ timeout: 25_000 });
  await expect(dialog.getByRole("checkbox").first()).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await dialog.getByRole("checkbox").nth(i).check();
  }
  await dialog.getByRole("button", { name: "Guardar mis nominaciones" }).click();
  await expect(dialog.getByText("Nominaciones enviadas")).toBeVisible();
  await dialog.getByRole("button", { name: "Confirmar" }).click();
  await expect(dialog.getByText("¿Estás seguro?")).toBeVisible({ timeout: 25_000 });
  await dialog.getByRole("button", { name: "Sí, confirmar" }).click();
  await expect(dialog.getByText(/Paso: (MVP confirmado|MVP y bajas)/)).toBeVisible({
    timeout: 30_000,
  });
  return dialog;
}

/** Advances a coach's own side past step 4 (the MVP REVEAL + the visible
 *  casualties). The reveal fires automatically once BOTH sides confirmed. */
async function driveRevealAndCasualties(page: Page, dialog: ReturnType<Page["getByRole"]>) {
  await expect(dialog.getByText("Paso: MVP y bajas")).toBeVisible({ timeout: 35_000 });
  await dialog.getByRole("button", { name: "Continuar" }).click();
}

/** Finishes step 5 (journeymen) — the ≥11-healthy sides here have nothing to
 *  decide → completes the side ("Continuar"). Retry-tolerant: the modal
 *  re-renders while its in-flight refreshes settle. */
async function driveJourneymenDone(dialog: ReturnType<Page["getByRole"]>) {
  await expect(dialog.getByText("Paso: Novatos")).toBeVisible({ timeout: 20_000 });
  for (let attempt = 0; attempt < 5; attempt++) {
    const hire = dialog.getByTestId("journeymen-hire");
    if ((await hire.count()) === 0) break; // nothing (more) to decide
    const letGo = hire.getByRole("button", { name: "Dejar ir" }).first();
    if ((await letGo.count()) === 0) break; // the panel settled without decisions
    const remaining = await hire.getByRole("button", { name: "Dejar ir" }).count();
    await expect(letGo).toBeEnabled({ timeout: 15_000 });
    await letGo.dispatchEvent("click");
    if (remaining > 1) {
      await expect(dialog.getByRole("button", { name: "Continuar" })).toBeDisabled();
    }
  }
  await dialog.getByRole("button", { name: "Continuar" }).scrollIntoViewIfNeeded();
  await dialog.getByRole("button", { name: "Continuar" }).click();
}

// -----------------------------------------------------------------------------

test("full match journey: signup → teams → league → fixture → live match → resolution", async ({
  browser,
}) => {
  const tag = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
  const contextA = await browser.newContext({ locale: "es-ES" });
  const contextB = await browser.newContext({ locale: "es-ES" });
  const a = tight(await contextA.newPage()); // league owner + lower-TV coach
  const b = tight(await contextB.newPage()); // richer rival coach

  try {
    // --- Stage 1: two coaches sign up (6-digit email verification) -----------
    await test.step("signup of two coaches (6-digit email verification)", async () => {
      await signup(a, uniqueEmail(`fmj-admin-${tag}`));
      await signup(b, uniqueEmail(`fmj-rival-${tag}`));
    });

    // --- Stage 2: both teams through the create-team wizard ------------------
    const teamA = `FMJ Alpha ${tag}`; // 11 linemen → 550k → lower TV
    const teamB = `FMJ Bravo ${tag}`; // 9 linemen + 2 blitzers → 620k → richer
    await test.step("both teams created through the create-team wizard", async () => {
      await createTeam(a, teamA, 0);
      await createTeam(b, teamB, 2);
      // The wizard's roster tables hold exactly 11 players per team (BB2025 min).
      await a.goto("/teams");
      await expect(a.getByText(teamA)).toBeVisible();
      await b.goto("/teams");
      await expect(b.getByText(teamB)).toBeVisible();
    });

    // --- Stage 3: league create → assign both → start the season -------------
    const leagueName = `FMJ Liga ${tag}`;
    let leagueUrl = "";
    let matchUrl = "";
    await test.step("league created, both teams assigned, season started", async () => {
      await a.goto("/leagues");
      await expect(a.getByRole("heading", { level: 1, name: "Mis Ligas" })).toBeVisible();
      await a.getByRole("button", { name: "+ Nueva liga" }).first().click();
      await a.getByLabel("Nombre").fill(leagueName);
      await a.getByRole("button", { name: "Crear liga" }).click();
      await expect(a.getByText(leagueName)).toBeVisible();

      leagueUrl = await openLeagueCard(a, leagueName);
      await a.getByLabel("Tu equipo").selectOption({ label: teamA });
      await a.getByRole("button", { name: "Apuntarse" }).click();
      await expect(a.getByText(teamA)).toBeVisible();

      await b.goto("/leagues");
      await openLeagueCard(b, leagueName);
      await b.getByLabel("Tu equipo").selectOption({ label: teamB });
      await b.getByRole("button", { name: "Apuntarse" }).click();
      await expect(b.getByText(teamB)).toBeVisible();

      await a.reload();
      const startButton = a.getByRole("button", { name: "Iniciar liga" });
      await expect(startButton).toBeEnabled();
      await startButton.click();
      const startDialog = a.getByRole("dialog", { name: "Iniciar liga" });
      await expect(startDialog).toBeVisible();
      await a.getByLabel("¿Cuántas jornadas?").fill("1");
      await startDialog.getByRole("button", { name: "Iniciar liga" }).click();
      await expect(a.getByText("Iniciada")).toBeVisible();
      await expect(a.getByRole("region", { name: "Jornada 1" })).toBeVisible();
    });

    // --- Stage 4: propose + accept the fixture date (negotiation UI) ---------
    await test.step("fixture date proposed and accepted through the negotiation UI", async () => {
      const slot = futureSlot(10, 18, 0);

      await a.goto(leagueUrl);
      await openNegotiation(a);
      await expect(negotiationDialog(a)).toBeVisible();
      await proposeInDialog(a, slot.dateInput, "18:00");
      // The panel stays open after a propose and re-renders with the committed
      // proposal (own pending row + the agreed slot's label).
      await expect(negotiationDialog(a).getByText(slot.esLabel)).toBeVisible();

      // The rival loads the fresh proposal and accepts it — the dialog closes
      // only after the POST + refresh landed, so a closed panel = committed.
      await b.goto(leagueUrl);
      await openNegotiation(b);
      await expect(negotiationDialog(b).getByText(slot.esLabel)).toBeVisible();
      await negotiationDialog(b).getByRole("button", { name: "Aceptar" }).click();
      await expect(negotiationDialog(b)).toHaveCount(0);

      // The fixture derives `scheduled`: header "Programado" + the agreed slot.
      const region = b.getByRole("region", { name: "Jornada 1" });
      await expect(region.getByText(/Partido 1 · Programado/)).toBeVisible();
      await expect(region.getByText(slot.esRegex)).toBeVisible();

      // Fixture URL comes from the card's own "Ver partido" link (UI-derived).
      const href = await region
        .getByRole("link", { name: "Ver partido" })
        .getAttribute("href");
      expect(href).toMatch(/^\/leagues\/.+\/fixtures\/.+$/);
      matchUrl = href as string;
    });

    // --- Stage 5: consent ×2 → ready phase (inducements) → begin → kick-off --
    await test.step(
      "consent ×2 → ready phase (inducement confirm) → Empezar partido → kick-off feed",
      async () => {
        await a.goto(matchUrl);
        await expect(a.getByText(/Partido programado/).first()).toBeVisible();
        await expect(a.getByRole("button", { name: "Iniciar partido" })).toBeVisible();
        await a.getByRole("button", { name: "Iniciar partido" }).click();
        await expect(a.getByText(/Listo, esperando al rival/).first()).toBeVisible();

        // The second consent flips the match to ready on BOTH pages.
        await b.goto(matchUrl);
        await expect(b.getByRole("button", { name: "Iniciar partido" })).toBeVisible();
        await b.getByRole("button", { name: "Iniciar partido" }).click();
        await expect(b.getByText(/Listo para empezar/).first()).toBeVisible();
        await expect(b.getByRole("button", { name: "Empezar partido" })).toBeVisible();

        // Coach A owns the lower-TV team → the ready-phase purchase step (the
        // richer rival never sees it). Budget = the |ΔTV| gap (620k − 550k).
        await expect(a.getByRole("button", { name: "Empezar partido" })).toBeVisible();
        await expect(a.getByTestId("inducement-purchase")).toBeVisible();
        await expect(a.getByText(/Presupuesto disponible:/)).toBeVisible();
        await expect(b.getByTestId("inducement-purchase")).toHaveCount(0);

        // Buy one Bloodweiser Keg (50k fits the 70k budget) and confirm.
        await a.getByRole("button", { name: "Añadir Barriles de Bloodweiser" }).click();
        await expect(a.getByText(/50\.000/).first()).toBeVisible();
        await a.getByRole("button", { name: /Confirmar incentivos/i }).click();

        // The purchase persists (replace-cart) — a reload shows the saved cart.
        await a.reload();
        await expect(a.getByTestId("inducement-purchase")).toBeVisible();
        await expect(a.getByText(/1× Barriles de Bloodweiser/)).toBeVisible();
        await expect(a.getByRole("button", { name: /Reemplazar incentivos/i })).toBeVisible();

        // Kick off: the owner begins; both pages converge on the first turn.
        await a.getByRole("button", { name: "Empezar partido" }).click();
        await expect(a.getByText(/Mitad 1 · Turno 1/).first()).toBeVisible();
        await expect(b.getByText(/Mitad 1 · Turno 1/).first()).toBeVisible();

        // Kick-off feed at minute 0: the start card + the fan-factor center row.
        // Both e2e teams start at treasury 0 (schema default), BELOW the 100k
        // rulebook minimum → RAU-33 skips the expensive-mistake roll entirely.
        const rows = a.getByTestId("live-event-row");
        await expect(rows.filter({ hasText: "Inicio del partido" })).toHaveCount(1);
        await expect(rows.filter({ hasText: "Factor de aficionados" })).toHaveCount(1);
        await expect(rows.filter({ hasText: "Error costoso" })).toHaveCount(0);
        await expect(a.getByTestId("rulebook-header")).toBeVisible();
      },
    );

    // --- Stage 6: ALL 16 turn slots of Mitad 1 through the dock --------------
    await test.step("Mitad 1: 16 turn slots via the dock, header flips to Mitad 2", async () => {
      let passes = 0;
      for (;;) {
        const active = await activeCoach(a, b);
        const other = active === a ? b : a;
        if ((await halfTurn(active)) === "Mitad 2 · Turno 1") break;
        expect(
          passes,
          "Mitad 1 must complete within its 16 team-turn slots",
        ).toBeLessThan(16);
        await passTurn(active, other);
        passes++;
        if (passes === 1) {
          // LM-13 once: the now non-active coach nudges; the active sees the
          // banner live (the requestTurn cooldown is 60s → exercised exactly once).
          await expect(active.getByRole("button", { name: "Pedir turno" })).toBeVisible();
          await active.getByRole("button", { name: "Pedir turno" }).click();
          await expect(other.getByText("Tu rival pide el turno")).toBeVisible();
          await expect(active.getByText("Tu rival pide el turno")).toHaveCount(0);
        }
      }
      // All 16 Mitad-1 slots were played, and the header flipped to half 2
      // (the away side receives the second-half kick-off).
      expect(passes).toBe(16);
      const activeNow = await activeCoach(a, b);
      await expect(await halfTurn(activeNow)).toBe("Mitad 2 · Turno 1");
      await expect(a.getByText(/Mitad 2/).first()).toBeVisible();
      await expect(b.getByText(/Mitad 2/).first()).toBeVisible();
    });

    // --- Stage 7: Mitad 2 up to Turno 8 through the dock ---------------------
    await test.step("Mitad 2: every turn through the dock up to Turno 8", async () => {
      let passes = 0;
      for (;;) {
        const active = await activeCoach(a, b);
        if ((await halfTurn(active)) === "Mitad 2 · Turno 8") break;
        expect(
          passes,
          "half 2 must reach Turno 8 within its remaining turn slots",
        ).toBeLessThan(16);
        await passTurn(active, active === a ? b : a);
        passes++;
      }
      expect(passes).toBeGreaterThan(0);
      const active = await activeCoach(a, b);
      await expect(await halfTurn(active)).toBe("Mitad 2 · Turno 8");
    });

    // --- Stage 8: TD in Mitad 2 Turno 8 → auto-finish (UI-only close) --------
    await test.step("TD in Mitad 2 Turno 8 auto-finishes the match (UI close)", async () => {
      const scorer = await activeCoach(a, b);
      const other = scorer === a ? b : a;
      expect(await halfTurn(scorer)).toBe("Mitad 2 · Turno 8");

      // Score through the REAL dock — never the API-only `endMatch` command.
      await dockScoredAction(scorer, "Touchdown", 0);

      // Auto-finish (D5): the live dock disappears for both coaches and the
      // scoreboard carries the TD — the fixture-away side received half 2, so
      // the scorer is the away side and the read is 0 : 1.
      await expect(scorer.getByTestId("live-action-dock")).toHaveCount(0);
      await expect(other.getByTestId("live-action-dock")).toHaveCount(0);
      await expect(scorer.getByTestId("score-home")).toHaveText("0");
      await expect(scorer.getByTestId("score-away")).toHaveText("1");
      await expect(
        scorer.getByTestId("live-event-row").filter({ hasText: "★3" }).first(),
      ).toBeVisible();
    });

    // --- Stage 9: resolve wizard ×2 coaches (5 steps each) -------------------
    await test.step("resolve wizard ×2 coaches (5 steps each)", async () => {
      const dialogA = await driveWinningsFansMvp(a, matchUrl);
      const dialogB = await driveWinningsFansMvp(b, matchUrl);
      // BOTH confirmed → the reveal fires automatically (the only joint wait).
      await driveRevealAndCasualties(a, dialogA);
      await driveRevealAndCasualties(b, dialogB);
      await driveJourneymenDone(dialogA);
      // The LAST completion closes the match and the modal closes itself.
      await driveJourneymenDone(dialogB);
      await expect(dialogB).not.toBeVisible({ timeout: 30_000 });
    });

    // --- Stage 10: "Jornada completa" + persistence after reload -------------
    await test.step("Jornada completa; result persists after reload", async () => {
      // Match view: the reported result + both MVP rows (★4 per side).
      await a.goto(matchUrl);
      await expect(
        a.getByTestId("summary-row-reported").filter({ hasText: "Partido reportado" }),
      ).toBeVisible();
      await expect(a.getByTestId("score-home")).toHaveText("0");
      await expect(a.getByTestId("score-away")).toHaveText("1");
      const mvpRows = a.getByTestId("live-event-row").filter({ hasText: "Jugador más valioso" });
      await expect(mvpRows.filter({ hasText: "★4" })).toHaveCount(2);

      // League marcador: played fixture + recorded score + the completed round.
      await a.goto(leagueUrl);
      const region = a.getByRole("region", { name: "Jornada 1" });
      await expect(region.getByText(/Partido 1 · Jugado/)).toBeVisible();
      await expect(region.getByText(/(0 : 1)/)).toBeVisible();
      await expect(a.getByText("Jornada completa")).toBeVisible();

      // Persistence: both surfaces survive a full reload.
      await a.reload();
      await expect(a.getByText("Jornada completa")).toBeVisible();
      await expect(region.getByText(/Partido 1 · Jugado/)).toBeVisible();
      await expect(region.getByText(/(0 : 1)/)).toBeVisible();

      await a.goto(matchUrl);
      await a.reload();
      await expect(
        a.getByTestId("summary-row-reported").filter({ hasText: "Partido reportado" }),
      ).toBeVisible();
      await expect(a.getByTestId("score-away")).toHaveText("1");
    });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
