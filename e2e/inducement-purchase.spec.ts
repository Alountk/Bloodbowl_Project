import { test, expect, type Browser, type Page } from "@playwright/test";
test.use({ locale: "es-ES" });

/**
 * Real-DB E2E for the S2 ready-phase inducement purchase step (IND-1..3,
 * LM-30) — AUTH suite only (`pnpm run test:e2e:auth` with AUTH_MODE=auth +
 * Postgres; ignored in the local `AUTH_MODE=local` suite).
 *
 * SCOPE (Slice S2): the lower-TV coach buys a common inducement in the `ready`
 * phase and the purchase persists (replace-cart). The S4 per-team feed chips
 * ("2× Sobornos" in the finished feed) are NOT asserted here — that slice is a
 * later chained PR; this spec ends at the persisted-cart confirmation.
 *
 * ENVIRONMENT LIMITATION (documented): this machine's :3000 (dev) and :5433
 * (Postgres) ports are occupied by long-running processes, so Playwright's own
 * `next dev` webServer cannot boot here. The S2 verification is therefore
 * carried by the component/integration suites (MatchView.test.tsx ready-phase
 * purchase tests + fixture-GET route tests) and this spec documents the
 * intended real-DB flow to run when the environment permits (`pnpm run
 * test:e2e:auth` on CI or a free-port machine).
 *
 * SETUP for a deterministic budget: the admin's team is the LOWER-TV side (11
 * human linemen only) and the rival's team is RICHER (blitzers at 85k each), so
 * the |ΔTV| budget lands on the ADMIN regardless of the randomized home/away
 * assignment — the admin (whoever the fixture says) sees the purchase step and
 * the rival never does.
 */
test.setTimeout(180_000);

const PASSWORD = "password-123";
const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

function tight(page: Page) {
  page.setDefaultTimeout(12_000);
  return page;
}

async function signup(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByLabel("Nombre").fill("Entrenador E2E");
  await page.getByRole("button", { name: "Registrarse" }).last().click();
  await expect(page).toHaveURL("/");
}

/** Drafts a HUMAN team. `blitzers` (0..2) raises the roster cost vs linemen. */
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
  await expect(page.getByText(name)).toBeVisible();
}

/** Builds a started 2-member league: admin = lower-TV, rival = richer. */
async function buildStartedLeague(browser: Browser, tag: string) {
  const contextA = await browser.newContext({ locale: "es-ES" });
  const contextB = await browser.newContext({ locale: "es-ES" });
  const admin = tight(await contextA.newPage());
  const rival = tight(await contextB.newPage());
  const close = async () => {
    await contextA.close();
    await contextB.close();
  };

  try {
    await signup(admin, uniqueEmail(`ind-admin-${tag}`));
    const adminTeam = `IND-A-${tag}`;
    await createTeam(admin, adminTeam, 0); // 11 linemen → 550k roster.
    const leagueName = `IND Liga ${tag}`;
    await admin.goto("/leagues");
    await expect(admin.getByRole("heading", { level: 1, name: "Mis Ligas" })).toBeVisible();
    await admin.getByRole("button", { name: "+ Nueva liga" }).first().click();
    await admin.getByLabel("Nombre").fill(leagueName);
    await admin.getByRole("button", { name: "Crear liga" }).click();
    await expect(admin.getByText(leagueName)).toBeVisible();
    await admin
      .locator("li")
      .filter({ hasText: leagueName })
      .getByRole("link", { name: "Ver", exact: true })
      .click();
    await expect(admin).toHaveURL(/\/leagues\/.+$/);
    const leagueId = /\/leagues\/(.+)$/.exec(admin.url())?.[1];
    expect(leagueId).toBeDefined();
    await admin.getByLabel("Tu equipo").selectOption({ label: adminTeam });
    await admin.getByRole("button", { name: "Apuntarse" }).click();
    await expect(admin.getByText(adminTeam)).toBeVisible();

    const rivalEmail = uniqueEmail(`ind-rival-${tag}`);
    await signup(rival, rivalEmail);
    const rivalTeam = `IND-B-${tag}`;
    await createTeam(rival, rivalTeam, 2); // +2 blitzers → richer → rival NOT eligible.
    await rival.goto("/leagues");
    await rival
      .locator("li")
      .filter({ hasText: leagueName })
      .getByRole("link", { name: "Ver", exact: true })
      .click();
    await rival.getByLabel("Tu equipo").selectOption({ label: rivalTeam });
    await rival.getByRole("button", { name: "Apuntarse" }).click();
    await expect(rival.getByText(rivalTeam)).toBeVisible();

    await admin.reload();
    const startButton = admin.getByRole("button", { name: "Iniciar liga" });
    await expect(startButton).toBeEnabled();
    await startButton.click();
    await expect(admin.getByRole("dialog", { name: "Iniciar liga" })).toBeVisible();
    await admin.getByLabel("¿Cuántas jornadas?").fill("1");
    await admin
      .getByRole("dialog", { name: "Iniciar liga" })
      .getByRole("button", { name: "Iniciar liga" })
      .click();
    await expect(admin.getByText("Iniciada")).toBeVisible();

    return { admin, rival, leagueId: leagueId as string, adminTeam, rivalTeam, close };
  } catch (error) {
    await close();
    throw error;
  }
}

/** Schedules the fixture via API (rival proposes, admin accepts). */
async function scheduleFixture(admin: Page, rival: Page, leagueId: string, fixtureId: string) {
  const proposal = await rival.request.post(
    `/api/leagues/${leagueId}/fixtures/${fixtureId}/propose`,
    { data: { date: new Date(Date.now() + 10 * 86400_000).toISOString() } },
  );
  expect(proposal.status()).toBe(200);
  const prop = (await proposal.json()) as { id: string };
  const accepted = await admin.request.post(
    `/api/leagues/${leagueId}/fixtures/${fixtureId}/accept`,
    { data: { proposalId: prop.id } },
  );
  expect(accepted.status()).toBe(200);
}

test("ready-phase inducement purchase: lower-TV coach buys; rival never sees the step", async ({
  browser,
}) => {
  const tag = Date.now().toString(36);
  const { admin, rival, leagueId, close } = await buildStartedLeague(browser, tag);
  try {
    const res = await admin.request.get(`/api/leagues/${leagueId}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      fixtures: { id: string; status: string }[];
    };
    const fixture = body.fixtures[0];
    expect(fixture).toBeDefined();
    await scheduleFixture(admin, rival, leagueId, fixture.id);

    // Two-phase consent through the REAL buttons: admin first, rival second.
    const matchUrl = `/leagues/${leagueId}/fixtures/${fixture.id}`;
    await admin.goto(matchUrl);
    await expect(admin.getByText(/Partido programado/).first()).toBeVisible();
    await admin.getByRole("button", { name: "Iniciar partido" }).click();
    await expect(admin.getByText(/Listo, esperando al rival/).first()).toBeVisible();

    await rival.goto(matchUrl);
    await rival.getByRole("button", { name: "Iniciar partido" }).click();
    // B's second consent flips the match to ready on BOTH pages.
    await expect(rival.getByText(/Listo para empezar/).first()).toBeVisible();

    // The ADMIN is the lower-TV side → the purchase step appears with a
    // positive budget; the rival (richer team) never sees it.
    await expect(admin.getByTestId("inducement-purchase")).toBeVisible();
    await expect(admin.getByText(/Presupuesto disponible:/)).toBeVisible();
    await expect(rival.getByTestId("inducement-purchase")).toHaveCount(0);

    // Buy one wizard (150k) through the REAL catalog controls.
    await admin.getByRole("button", { name: "Añadir Mago" }).click();
    await expect(admin.getByText(/150\.000/).first()).toBeVisible();
    await admin.getByRole("button", { name: /Confirmar incentivos/i }).click();

    // The purchase persists (replace-cart) — reload shows the saved cart and
    // the "Reemplazar" affordance instead of a fresh confirm.
    await admin.reload();
    await expect(admin.getByTestId("inducement-purchase")).toBeVisible();
    await expect(admin.getByText(/1× Mago/)).toBeVisible();
    await expect(admin.getByRole("button", { name: /Reemplazar incentivos/i })).toBeVisible();

    // Begin still works after a purchase (LM-30: begin is untouched by a cart).
    await admin.getByRole("button", { name: "Empezar partido" }).click();
    await expect(admin.getByText(/Mitad 1 · Turno 1/).first()).toBeVisible();
  } finally {
    await close();
  }
});
