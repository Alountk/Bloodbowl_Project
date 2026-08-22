import { test, expect, type Page, type Browser } from "@playwright/test";
test.use({ locale: "es-ES" });

/**
 * Real-DB avatar E2E (run via `pnpm run test:e2e:auth` with AUTH_MODE=auth and a
 * running Postgres). Exercises the profile-panel avatar journey against the real
 * sharp+storage pipeline AND proves the server-issued avatar value propagates to
 * the MatchCard owner rows in a started league:
 *
 *  1. profile-avatar: signup → /profile shows no avatar → upload a cropped PNG →
 *     the preview renders → reload → avatar persists (DB read, not JWT) → clear
 *     via PATCH null → reload → avatar gone.
 *  2. matchcard-emblem: a started 2-member league whose owners both uploaded —
 *     the round-1 MatchCard renders both teams' deterministic EMBLEMS (Design B
 *     replaced the owner-avatar line with the emblem + race line), one per team,
 *     with the team's initial badge inside.
 *
 * A valid 1×1 PNG (68 B) is uploaded in real browser; the server sniff + sharp
 * 256×256 WebP resize is exercised on every upload. The profile flow has no
 * explicit "clear" UI control (matching the server-only PATCH allowlist), so the
 * clear step uses the same documented PATCH /api/me {avatar:null} the UI is
 * backed by, followed by a reload to verify it is gone.
 *
 * NOTE (auth cold-start race): the FIRST auth-suite run right after a fresh
 * `pnpm run test:e2e:auth` boot can time out on /signup while the dev server and
 * Postgres cold-start; a re-run is green. Timeouts below reflect the heavy
 * 2-signup/2-team/1-league setup.
 */
test.setTimeout(240_000);

const PASSWORD = "password-123";
const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

/** A real, decodable 1×1 PNG that sharp can resize (≈68 B < 2 MB cap). */
const AVATAR_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

/** Signs up and lands on the home page with an active session. */
async function signup(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByLabel("Nombre").fill("Entrenador E2E");
  await page.getByRole("button", { name: "Registrarse" }).last().click();
  await expect(page).toHaveURL("/");
}

/** Creates a human team of `playerCount` (default 11, BB2025 minimum). */
async function createTeam(page: Page, name: string, playerCount = 11) {
  await page.goto("/teams/create");
  await page.getByLabel("Nombre del equipo").fill(name);
  await page.getByLabel("Raza").selectOption("human");
  await page.getByRole("button", { name: "Siguiente →" }).click();
  const add = page.getByRole("button", { name: "Añadir Human Lineman" }).first();
  for (let i = 0; i < playerCount; i++) await add.click();
  await page.getByRole("button", { name: /crear equipo/i }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText(name)).toBeVisible();
}

/** Uploads an avatar through the real /profile UI (picker → crop → Guardar). */
async function uploadAvatarViaProfile(page: Page) {
  await page.goto("/profile");
  await page.getByRole("button", { name: "Subir foto" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from(AVATAR_PNG, "base64"),
  });
  await page.getByRole("dialog", { name: "Recortar foto" }).waitFor();
  await page.getByRole("dialog", { name: "Recortar foto" }).getByRole("button", { name: "Guardar" }).click();
  // The preview img appears once the server-issued value comes back.
  await expect(page.getByRole("img", { name: "Avatar del entrenador" })).toBeVisible();
}

/** Builds a started 2-member league (admin A + rival B, no bye) and returns the
 * page/url helpers. 2 teams → the round-robin yields exactly one 1-round, 1-fixture
 * match A×B, so the MatchCard always shows both owners' avatars deterministically. */
interface TwoMemberLeague {
  admin: Page;
  rival: Page;
  leagueUrl: string;
  close: () => Promise<void>;
}

async function buildTwoMemberStartedLeague(browser: Browser, tag: string): Promise<TwoMemberLeague> {
  const contextA = await browser.newContext({ locale: "es-ES" });
  const contextB = await browser.newContext({ locale: "es-ES" });
  const admin = await contextA.newPage();
  const rival = await contextB.newPage();
  const close = async () => {
    await contextA.close();
    await contextB.close();
  };

  try {
    // Admin A: signup + team + league, joins with their own team.
    await signup(admin, uniqueEmail(`avatar-admin-${tag}`));
    const teamAName = `AA-${tag} ${Date.now()}`;
    await createTeam(admin, teamAName);
    const leagueName = `Avatar Liga ${tag} ${Date.now()}`;
    await admin.goto("/leagues");
    await expect(admin.getByRole("heading", { level: 1, name: "Mis Ligas" })).toBeVisible();
    await admin.getByRole("button", { name: "+ Nueva liga" }).first().click();
    await admin.getByLabel("Nombre").fill(leagueName);
    await admin.getByLabel("Descripción").fill("Liga avatar e2e");
    await admin.getByRole("button", { name: "Crear liga" }).click();
    await expect(admin.getByText(leagueName)).toBeVisible();
    await admin
      .locator("li")
      .filter({ hasText: leagueName })
      .getByRole("link", { name: "Ver", exact: true })
      .click();
    await expect(admin).toHaveURL(/\/leagues\/.+$/);
    const leagueUrl = admin.url();
    await admin.getByLabel("Tu equipo").selectOption({ label: teamAName });
    await admin.getByRole("button", { name: "Apuntarse" }).click();
    await expect(admin.getByText(teamAName)).toBeVisible();

    // Rival B: signup + team → join A's OPEN league.
    await signup(rival, uniqueEmail(`avatar-rival-${tag}`));
    const teamBName = `BB-${tag} ${Date.now()}`;
    await createTeam(rival, teamBName);
    await rival.goto("/leagues");
    await expect(rival.getByRole("heading", { level: 1, name: "Mis Ligas" })).toBeVisible();
    await rival
      .locator("li")
      .filter({ hasText: leagueName })
      .getByRole("link", { name: "Ver", exact: true })
      .click();
    await expect(rival).toHaveURL(/\/leagues\/.+$/);
    await rival.getByLabel("Tu equipo").selectOption({ label: teamBName });
    await rival.getByRole("button", { name: "Apuntarse" }).click();
    await expect(rival.getByText(teamBName)).toBeVisible();

    // A starts the season with 1 jornada.
    await admin.reload();
    await expect(admin.getByRole("heading", { name: leagueName })).toBeVisible();
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
    await expect(admin.getByRole("region", { name: "Jornada 1" })).toBeVisible();

    return { admin, rival, leagueUrl, close };
  } catch (error) {
    await close();
    throw error;
  }
}

test.describe("Avatar E2E (real Postgres)", () => {
  test("profile: upload → render → reload persists → clear via PATCH → gone", async ({ page }) => {
    await signup(page, uniqueEmail("avatar-profile"));

    // Fresh user has no avatar: no coach-avatar img renders (scoped to the
    // avatar alt — the shell chrome has its own logo img, not the avatar).
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Mi Perfil" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Avatar del entrenador" })).toHaveCount(0);

    // Upload through the real crop UI; the preview updates from GET /api/me.
    await uploadAvatarViaProfile(page);
    const firstSrc = await page.getByRole("img", { name: "Avatar del entrenador" }).getAttribute("src");
    expect(firstSrc).toMatch(/^\/uploads\/avatars\//);

    // Reload: the avatar comes from the DB (adapter-issued), not the JWT.
    await page.reload();
    await expect(page.getByRole("img", { name: "Avatar del entrenador" })).toBeVisible();
    const afterReload = await page
      .getByRole("img", { name: "Avatar del entrenador" })
      .getAttribute("src");
    expect(afterReload).toBe(firstSrc);

    // Clear via the same PATCH /api/me {avatar:null} the UI is backed by, then
    // reload proves it is gone.
    const clear = await page.request.patch("/api/me", { data: { avatar: null } });
    expect(clear.status()).toBe(200);
    await page.reload();
    await expect(page.getByRole("img", { name: "Avatar del entrenador" })).toHaveCount(0);
  });

  test("matchcard: a started 2-member league shows both team emblems on the round-1 card", async ({
    browser,
  }) => {
    const league = await buildTwoMemberStartedLeague(browser, "mc");
    try {
      // Both members upload avatars through the real /profile UI (the profile
      // journey is avatar's home — the MatchCard now renders emblems, Design B).
      await uploadAvatarViaProfile(league.admin);
      await uploadAvatarViaProfile(league.rival);

      // A fresh view of the league detail carries each team's deterministic
      // EMBLEM (initial badge, Design B) — one per side on the round-1 card.
      await league.admin.goto(league.leagueUrl);
      const region = league.admin.getByRole("region", { name: "Jornada 1" });
      const emblems = region.getByLabel(/Emblema de/);
      await expect(emblems).toHaveCount(2);

      // Each emblem shows its team's initial (A/B — the admin/rival team names).
      const initials = await emblems.evaluateAll((els) =>
        els.map((el) => el.textContent?.trim() ?? ""),
      );
      expect(initials).toContain("A");
      expect(initials).toContain("B");

      // Design B: the card no longer renders the owner avatars (emblem + race
      // line replace the avatar row) — the avatar stays on the profile/coach rows.
      await expect(region.getByRole("img", { name: "Avatar del entrenador" })).toHaveCount(0);
    } finally {
      await league.close();
    }
  });
});
