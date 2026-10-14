import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { UiFlagProvider } from "@/lib/ui-flag";
import Page from "@/app/leagues/page";

/**
 * LeaguesListViewV2 + seam tests (tasks 1.1 and 2.1, UIR-2).
 *
 * Slice 1 pins the FIFTH declared seam (`app/leagues/page.tsx`):
 *  - flag ON (`UiFlagProvider initialUiFlag`) → `LeaguesListViewV2` mounts
 *    (`ui-v2-leagues-*` vocabulary), the legacy surface never does
 *    (`#leagues-heading` id absent — never both);
 *  - flag OFF (provider absent OR `initialUiFlag={false}`) → the legacy
 *    `LeagueList` mounts (`#leagues-heading` present), V2 never does;
 *  - both surfaces take NO props (the route passes none) — identical
 *    contract by construction.
 *
 * The V2 is presentation-only: it reuses the legacy surface's OWN machinery
 * (`useLeagues` → single `GET /api/leagues`, `useSession`, `isOwnerEquivalent`,
 * the shared `LeagueCard`/`StatusBadge`/`CreateLeagueModal` exports) and the
 * SAME `myLeagues`/`openLeagues` split — no new fetch, no duplicated filter
 * semantics. Assertions run in the ES dictionary (bare `useI18n()` fallback,
 * the component-test convention; leagues copy is Spanish per AGENTS.md).
 *
 * No flag-ON e2e test walks `/leagues` today (traced — design.md S7), so the
 * contract here is the surface itself; the flag-ON e2e cases goto directly.
 */

const sessionMock = vi.hoisted(() =>
  vi.fn(() => ({ data: { user: { id: "u1" } }, status: "authenticated" })),
);
vi.mock("next-auth/react", () => ({
  useSession: () => sessionMock(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  sessionMock.mockReturnValue({ data: { user: { id: "u1" } }, status: "authenticated" });
});

/** League rows shaped like the `GET /api/leagues` payload (League interface). */
function league(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "l1",
    name: "North Reikland",
    description: "Mi liga",
    ownerId: "u1",
    createdAt: "2026-01-01",
    status: "open",
    seasonLength: null,
    startedAt: null,
    championTeamId: null,
    ownerName: "Coach A",
    memberCount: 3,
    isMember: false,
    ...overrides,
  };
}

/** Stubs the single legacy endpoint (`useLeagues` → `listLeagues`). */
function stubLeaguesFetch(rows: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) }),
    ),
  );
}

/**
 * Renders the ROUTE PAGE (the seam itself) the way the root layout mounts it,
 * plus `UiFlagProvider` only when a flag value is given (absent provider must
 * fall back to legacy — UIR-1). Session + fetch stubs mirror `LeagueList.test.tsx`.
 */
function renderSeam(uiFlag?: boolean) {
  stubLeaguesFetch([league()]);
  const page = <Page />;
  return render(
    uiFlag === undefined ? (
      page
    ) : (
      <UiFlagProvider initialUiFlag={uiFlag}>{page}</UiFlagProvider>
    ),
  );
}

/** Renders the V2 surface directly with a stubbed endpoint (dynamic import → meaningful RED). */
async function renderV2(rows: unknown[] = [league()]) {
  stubLeaguesFetch(rows);
  // Non-literal specifier: vite leaves it to runtime, so the seam tests above
  // still execute their assertions while the component file is absent.
  const spec = "./LeaguesListViewV2";
  const { LeaguesListViewV2 } = await import(/* @vite-ignore */ spec);
  return render(<LeaguesListViewV2 />);
}

describe("leagues seam (UIR-2): app/leagues/page.tsx", () => {
  it("flag ON: initialUiFlag mounts the V2 surface, never the legacy one", async () => {
    renderSeam(true);

    expect(await screen.findByTestId("ui-v2-leagues-hero")).toBeTruthy();
    // Never both: the legacy hero id must not exist.
    expect(document.getElementById("leagues-heading")).toBeNull();
    expect(document.getElementById("my-leagues-heading")).toBeNull();
  });

  it("flag OFF without a provider: the legacy surface mounts, never V2", async () => {
    renderSeam();

    await waitFor(() => expect(document.getElementById("leagues-heading")).toBeTruthy());
    expect(screen.queryByTestId("ui-v2-leagues-hero")).toBeNull();
    expect(document.querySelector('[data-testid^="ui-v2-leagues-"]')).toBeNull();
  });

  it("flag OFF with the provider seeded false: the legacy surface mounts", async () => {
    renderSeam(false);

    await waitFor(() => expect(document.getElementById("leagues-heading")).toBeTruthy());
    expect(document.querySelector('[data-testid^="ui-v2-leagues-"]')).toBeNull();
  });
});

describe("LeaguesListViewV2 core (slice 1 — skeleton on the legacy channel)", () => {
  it("renders the hero, the CTA and both sections with the SAME split as legacy", async () => {
    // u1 owns l1 (Mis Ligas); l2 is a foreign open league (Ligas abiertas);
    // l3 is a foreign STARTED league → server never returns it as open, so it
    // lands nowhere — mirroring the legacy filter exactly.
    await renderV2([
      league(),
      league({ id: "l2", name: "Middenheim Cup", ownerId: "u2" }),
      league({ id: "l3", name: "Old World Series", ownerId: "u2", status: "started" }),
    ]);

    const hero = await screen.findByTestId("ui-v2-leagues-hero");
    expect(within(hero).getByText("Mis Ligas")).toBeTruthy();

    const mySection = screen.getByTestId("ui-v2-leagues-section-my");
    const openSection = screen.getByTestId("ui-v2-leagues-section-open");
    expect(within(mySection).getByText("North Reikland")).toBeTruthy();
    expect(within(mySection).queryByText("Middenheim Cup")).toBeNull();
    expect(within(openSection).getByText("Middenheim Cup")).toBeTruthy();
    expect(within(openSection).queryByText("North Reikland")).toBeNull();
    // Foreign started league is in neither section (parity with legacy split).
    expect(within(mySection).queryByText("Old World Series")).toBeNull();
    expect(within(openSection).queryByText("Old World Series")).toBeNull();
  });

  it("the CTA opens the SHARED CreateLeagueModal (reused atom, legacy-identical)", async () => {
    await renderV2();

    fireEvent.click(await screen.findByTestId("ui-v2-leagues-create-cta"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-label")).toBe("Nueva liga");
  });

  it("empty state after load matches the legacy copy and keeps the CTA", async () => {
    await renderV2([]);

    expect(await screen.findByTestId("ui-v2-leagues-empty")).toBeTruthy();
    expect(screen.getByText("No hay ligas todavía. Crea la primera.")).toBeTruthy();
    expect(screen.getByTestId("ui-v2-leagues-create-cta")).toBeTruthy();
    expect(screen.queryByTestId("ui-v2-leagues-section-my")).toBeNull();
    expect(screen.queryByTestId("ui-v2-leagues-section-open")).toBeNull();
  });

  it("error state surfaces the endpoint failure (single GET /api/leagues)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) }),
      ),
    );
    const spec = "./LeaguesListViewV2";
    const { LeaguesListViewV2 } = await import(/* @vite-ignore */ spec);
    render(<LeaguesListViewV2 />);

    expect(await screen.findByTestId("ui-v2-leagues-error")).toBeTruthy();
    expect(screen.getByText(/Request failed \(401\)/)).toBeTruthy();
  });

  it("stays on the legacy channel: the source imports the legacy hook, not features/leagues/api", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const content = readFileSync(path.join(dir, "LeaguesListViewV2.tsx"), "utf8");

    // Presentation-only (UIR-2): reuses the legacy surface's own hook + shared
    // atoms; the endpoint fetch lives ONLY in `features/leagues/api.ts` (used
    // by `useLeagues`, which legacy itself imports).
    expect(content).toContain("useLeagues");
    expect(content).toContain("LeagueCard");
    expect(content).toContain("CreateLeagueModal");
    expect(content).not.toMatch(/\bfetch\s*\(/);
    // Never-both vocabulary: legacy DOM ids are never reused by V2 source.
    expect(content).not.toMatch(
      /id="leagues-heading"|id="my-leagues-heading"|id="open-leagues-heading"/,
    );
  });
});
