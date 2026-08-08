import { test, expect } from "@playwright/test";

/**
 * Real-DB multi-user isolation E2E (run via `pnpm run test:e2e:auth`).
 * Verifies the user-scoping contract of /api/teams against a real Postgres:
 * - User B cannot list User A's teams.
 * - User B cannot DELETE User A's team (foreign id → 404, no mutation).
 * - User A's team remains intact.
 */

const uniqueEmail = (tag: string) =>
  `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

test.describe("User isolation E2E (real Postgres)", () => {
  test("users are isolated and a foreign team delete returns 404", async ({ browser }) => {
    const password = "password-123";

    // Two independent signed-in contexts.
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    // User A: signup and create a team.
    await pageA.goto("/signup");
    await pageA.getByLabel("Email").fill(uniqueEmail("userA"));
    await pageA.getByLabel("Password").fill(password);
    await pageA.getByRole("button", { name: "Sign up" }).last().click();
    await expect(pageA).toHaveURL("/");

    await pageA.goto("/teams/create");
    await pageA.getByLabel("Team name").fill("Alpha Blitzers");
    await pageA.getByLabel("Race").selectOption("human");
    await pageA.getByRole("button", { name: /siguiente/i }).click();
    await pageA.getByRole("button", { name: "Add Lineman" }).first().click();
    await pageA.getByRole("button", { name: "Add Lineman" }).first().click();
    await pageA.getByRole("button", { name: "Add Blitzer" }).first().click();
    await pageA.getByRole("button", { name: /create team/i }).click();
    await expect(pageA).toHaveURL("/");
    await expect(pageA.getByText("Alpha Blitzers")).toBeVisible();

    // Read A's DB team id from the user-scoped API.
    const aTeamId: string = await pageA.evaluate(async () => {
      const res = await fetch("/api/teams");
      const teams = (await res.json()) as Array<{ id: string; name: string }>;
      return teams[0].id;
    });

    // User B: signup into a brand-new account.
    await pageB.goto("/signup");
    await pageB.getByLabel("Email").fill(uniqueEmail("userB"));
    await pageB.getByLabel("Password").fill(password);
    await pageB.getByRole("button", { name: "Sign up" }).last().click();
    await expect(pageB).toHaveURL("/");

    // B's list does NOT include A's team (isolation).
    const bTeams = await pageB.evaluate(async () => {
      const res = await fetch("/api/teams");
      return (await res.json()) as Array<{ name: string }>;
    });
    expect(bTeams.some((t) => t.name === "Alpha Blitzers")).toBe(false);

    // B trying to DELETE A's team id → 404 (no leak, no mutation).
    const delRes = await pageB.evaluate(async (id) => {
      const res = await fetch(`/api/teams/${id}`, { method: "DELETE" });
      return res.status;
    }, aTeamId);
    expect(delRes).toBe(404);

    // A's team is still there after B's failed delete.
    await pageA.reload();
    await expect(pageA.getByText("Alpha Blitzers")).toBeVisible();

    await ctxA.close();
    await ctxB.close();
  });
});
