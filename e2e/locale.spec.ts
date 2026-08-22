import { test, expect, type Page } from "@playwright/test";

/**
 * RAU-58 per-account locale E2E (AUTH_MODE=auth + real Postgres). Pins:
 *
 *  1. signed-in account wins over the browser: a user whose account locale is
 *     es (set via the profile PATCH) renders the app in Spanish even when the
 *     `bb-locale` cookie says en (the SSR layout prefers the account locale
 *     read from the DB);
 *  2. the /profile Idioma selector persists the choice to the account (PATCH
 *     /api/me), reflects it immediately, and survives reload + re-login;
 *  3. anonymous visitors keep the cookie-driven behavior (no account to win).
 *
 * The account inherits the signup language (the signup route captures the
 * `bb-locale` cookie), so an English-context signup starts with an en account.
 *
 * Auth-only: requires the real Postgres + AUTH_MODE=auth, so it is excluded
 * from the default local `test:e2e` config and included in
 * playwright.config.auth.ts.
 */
test.setTimeout(240_000);

const PASSWORD = "password-123";
const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

async function signupEs(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByLabel("Nombre").fill("Entrenador Locale");
  await page.getByRole("button", { name: "Registrarse" }).last().click();
  await expect(page).toHaveURL("/");
}

async function signupEn(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel("Name").fill("Locale Coach");
  await page.getByRole("button", { name: "Sign up" }).last().click();
  await expect(page).toHaveURL("/");
}

async function loginEn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).last().click();
  await expect(page).toHaveURL("/");
}

/** Logs out through the avatar user menu (English copy, post switch). */
async function logoutEn(page: Page) {
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(
    page.getByRole("heading", { name: "Your league, in your pocket." }),
  ).toBeVisible();
}

/** Sets the per-browser `bb-locale` cookie for the current origin. */
async function setLocaleCookie(page: Page, value: string) {
  await page.context().addCookies([
    { name: "bb-locale", value, url: "http://localhost:3000" },
  ]);
}

test.describe("signed-in: the account locale wins over the cookie", () => {
  test.use({ locale: "en-US" });

  test("account es (set via PATCH) + browser cookie en → the app renders in es", async ({
    page,
  }) => {
    // This browser prefers English: navigator language AND the `bb-locale`
    // cookie say "en", so the new account inherits en at signup.
    await setLocaleCookie(page, "en");
    await signupEn(page, uniqueEmail("loc-acct-beats-cookie"));

    // The profile selector persists the account to es via PATCH /api/me.
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
    const group = page.getByTestId("profile-locale");
    await expect(group.getByRole("button", { name: "EN" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await group.getByRole("button", { name: "ES" }).click();
    await expect(page.getByRole("heading", { name: "Mi Perfil" })).toBeVisible();

    // Force the cookie back to "en": the SSR still reads the account (DB)
    // locale on every request, so the cookie never wins while signed in.
    await setLocaleCookie(page, "en");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Mi Perfil" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByTestId("profile-locale").getByRole("button", { name: "ES" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

test.describe("signed-in: the selector persists to the account", () => {
  test.use({ locale: "es-ES" });

  test("switching ES→EN reflects immediately and survives reload + re-login", async ({
    page,
  }) => {
    const email = uniqueEmail("loc-persist");
    await signupEs(page, email);

    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Mi Perfil" })).toBeVisible();

    const group = page.getByTestId("profile-locale");
    await expect(group.getByRole("button", { name: "ES" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Switch to EN: the PATCH persists to the account and the page flips now
    // (the <html lang> attribute is SSR-only, so it changes on the next reload).
    await group.getByRole("button", { name: "EN" }).click();
    await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
    await expect(group.getByRole("button", { name: "EN" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Survives a full reload (SSR re-reads the account locale from the DB).
    await page.reload();
    await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    // Survives logout → login: a fresh session still renders the account en.
    await logoutEn(page);
    await loginEn(page, email);
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
  });
});

test.describe("anonymous: the cookie drives the locale", () => {
  test.use({ locale: "fr-FR" });

  test("no account → the bb-locale cookie selects es/en on the landing", async ({
    page,
  }) => {
    // A non-English browser (fr) → Spanish is the default when no cookie is set.
    await page.goto("/");
    const switcher = page
      .locator("header")
      .getByRole("group", { name: /Idioma|Language/ });
    await expect(switcher).toHaveAttribute("aria-label", "Idioma");

    await setLocaleCookie(page, "en");
    await page.reload();
    await expect(switcher).toHaveAttribute("aria-label", "Language");

    await setLocaleCookie(page, "es");
    await page.reload();
    await expect(switcher).toHaveAttribute("aria-label", "Idioma");
  });
});
