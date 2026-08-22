import { test, expect, type Page } from "@playwright/test";

/**
 * Real-DB auth E2E (run via `pnpm run test:e2e:auth` with AUTH_MODE=auth and a
 * running Postgres). Verifies the full signed-in journey:
 * signup → create team → reload (DB-persisted) → logout → login → team persists.
 */

/** Unique email per run so a persisted Postgres never collides across runs. */
const uniqueEmail = () => `user-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

async function signup(page: Page, email: string, password: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByLabel("Name").fill("E2E Coach");
  await page.getByRole("button", { name: "Sign up" }).last().click();
  // Successful signup establishes a session and lands on `/`.
  await expect(page).toHaveURL("/");
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).last().click();
  await expect(page).toHaveURL("/");
}

/** Logs out through the avatar user menu (the nav's right-slot action). */
async function logout(page: Page) {
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
}

async function createTeam(page: Page, name: string) {
  await page.goto("/teams/create");
  await page.getByLabel("Team name", { exact: true }).fill(name);
  await page.getByLabel("Race").selectOption("human");
  await page.getByRole("button", { name: "Next →" }).click();
  // 11 Linemen so the team meets the BB2025 minimum roster size.
  const addLineman = page.getByRole("button", { name: "Add Human Lineman" }).first();
  for (let i = 0; i < 11; i++) await addLineman.click();
  await page.getByRole("button", { name: /create team/i }).click();
  // Redirect home and show the saved team.
  await expect(page).toHaveURL("/");
  await expect(page.getByText(name)).toBeVisible();
}

test.describe("Auth E2E (real Postgres)", () => {
  test("signup → create team → reload → logout → login (team persists)", async ({ page }) => {
    const email = uniqueEmail();
    const password = "password-123";

    await signup(page, email, password);

    const teamName = "Reikland Reavers";
    await createTeam(page, teamName);

    // Reload home: the team must come from the DB (not localStorage), so it is
    // still present after a full navigation.
    await page.reload();
    await expect(page.getByText(teamName)).toBeVisible();

    // Logout lands on the public landing and no longer shows the team (session cleared).
    await logout(page);
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Your league, in your pocket." })).toBeVisible();
    await expect(page.getByText(teamName)).not.toBeVisible();

    // Log back in with the same account: the team is still there from the DB.
    await login(page, email, password);
    await expect(page.getByText(teamName)).toBeVisible();
  });
});

/**
 * Unauthenticated-access audit (RAU-54): with AUTH_MODE=auth every mutating API
 * route and every user-scoped GET must return 401 without a session, and every
 * protected page must redirect to /login. This test pins that contract on a
 * fresh browser context with NO cookies (no signup/login first).
 */
test.describe("Unauthenticated access (auth mode)", () => {
  test("API mutating routes and user-scoped GETs reject with 401", async ({ page }) => {
    // Mutating routes: creating a league, joining a team, expelling a member.
    const createLeague = await page.request.post("/api/leagues", {
      data: { name: "Sneaky" },
    });
    expect(createLeague.status()).toBe(401);

    const createTeam = await page.request.post("/api/teams", {
      data: { name: "Sneaky", raceId: "human", roster: [], coaching: {} },
    });
    expect(createTeam.status()).toBe(401);

    const join = await page.request.post("/api/leagues/l1/teams", {
      data: { teamId: "t1" },
    });
    expect(join.status()).toBe(401);

    // User-scoped GETs: profile, own teams, open leagues, rulesets selector.
    expect((await page.request.get("/api/me")).status()).toBe(401);
    expect((await page.request.get("/api/teams")).status()).toBe(401);
    expect((await page.request.get("/api/leagues")).status()).toBe(401);
    expect((await page.request.get("/api/rulesets")).status()).toBe(401);
  });

  test("protected pages redirect to /login without a session", async ({ page }) => {
    await page.goto("/teams");
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/leagues");
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/teams/create");
    await expect(page).toHaveURL(/\/login$/);
  });
});

/**
 * Regression: the login → teams → logout → login flow must work WITHOUT a
 * manual reload. This mirrors the production host (LAN IP, not localhost) —
 * the reported bug ("no access until refresh") reproduced only against old
 * images/deploys, so this pins the exact production-shaped journey.
 */
test.describe("Auth flow regression (LAN host)", () => {
  test("login lands on teams with data, no refresh needed", async ({ page }) => {
    const email = uniqueEmail();
    const password = "password-123";
    // LAN base URL so the cookie/redirect path matches production (not localhost).
    const base = "http://111.111.111.100:3000";

    await page.goto(`${base}/signup`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByLabel("Name").fill("E2E Coach");
    await page.getByRole("button", { name: "Sign up" }).last().click();
    await expect(page).toHaveURL(`${base}/`);

    // Create a team (11 Linemen).
    await page.goto(`${base}/teams/create`);
    await page.getByLabel("Team name", { exact: true }).fill("LAN Reavers");
    await page.getByLabel("Race").selectOption("human");
    await page.getByRole("button", { name: "Next →" }).click();
    const add = page.getByRole("button", { name: "Add Human Lineman" }).first();
    for (let i = 0; i < 11; i++) await add.click();
    await page.getByRole("button", { name: /create team/i }).click();
    await expect(page).toHaveURL(`${base}/`);
    await expect(page.getByText("LAN Reavers")).toBeVisible();

    // Logout → the public landing.
    await logout(page);
    // Await the landing (not just the URL, which is already "/" on the
    // dashboard) so the async sign-out has cleared the session cookie.
    await expect(
      page.getByRole("heading", { name: "Your league, in your pocket." }),
    ).toBeVisible();

    // Login — WITHOUT any reload, teams must be visible and other sections reachable.
    await page.goto(`${base}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Log in" }).last().click();
    await expect(page).toHaveURL(`${base}/`);
    await expect(page.getByText("LAN Reavers")).toBeVisible();

    // No refresh: navigating to another protected section must work.
    await page.goto(`${base}/teams/create`);
    await expect(page.getByLabel("Team name", { exact: true })).toBeVisible();
  });
});
