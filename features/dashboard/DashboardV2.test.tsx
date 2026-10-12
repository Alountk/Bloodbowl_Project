import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { UiFlagProvider } from "@/lib/ui-flag";
import { HomeDashboard } from "./HomeDashboard";

/**
 * DashboardV2 + seam tests (tasks 1.1 and 1.3, UIR-2).
 *
 * Slice 1 pins the THIRD declared seam (`features/dashboard/HomeDashboard.tsx`):
 *  - flag ON (`UiFlagProvider initialUiFlag`) → the V2 skeleton mounts
 *    (`ui-v2-dashboard-*` vocabulary), the legacy surface never does;
 *  - flag OFF (provider absent OR `initialUiFlag={false}`) → the legacy
 *    `Dashboard` mounts (`#dashboard-teams-heading`), V2 never does;
 *  - both surfaces receive the SAME `{authenticated, userName}` props, so the
 *    seam passes them through verbatim;
 *  - the skeleton carries the "Your teams" summary link with the legacy
 *    "ready to improve" copy the flag-ON e2e harness
 *    (`createTeamAndOpenList` in e2e/ui-refresh-roster.spec.ts) clicks to
 *    reach `/teams` — legacy marker ids stay out of the V2 markup (never
 *    both, UIR-2).
 *
 * The seam mounts INSIDE HomeDashboard's own AppShell, so the test mocks the
 * two providers AppNav needs (`app/AppShell.test.tsx` pattern) and stubs the
 * legacy surface's only local-mode fetch (`GET /api/leagues`).
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

/** AppNav + the legacy surface read the session; no provider is mounted. */
const sessionMock = vi.hoisted(() =>
  vi.fn(() => ({ data: null, status: "unauthenticated" })),
);
vi.mock("next-auth/react", () => ({
  useSession: () => sessionMock(),
}));

/** Local-mode fetch stub: leagues resolve empty, anything else 404s. */
function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/leagues") {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Not found" }),
      });
    }),
  );
}

/**
 * Renders the SEAM (HomeDashboard) the way the root layout leaves it: the
 * `UiFlagProvider` wraps it only when a flag value is given (absent provider
 * must fall back to legacy — UIR-1). Local/anonymous mode keeps the shell on
 * its shared in-memory store, so no ApiTeamStore traffic is stubbed.
 */
function renderSeam(uiFlag?: boolean, userName: string | null = null) {
  stubFetch();
  const dashboard = <HomeDashboard authenticated={false} userName={userName} />;
  return render(
    uiFlag === undefined ? (
      dashboard
    ) : (
      <UiFlagProvider initialUiFlag={uiFlag}>{dashboard}</UiFlagProvider>
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dashboard seam (UIR-2): features/dashboard/HomeDashboard.tsx", () => {
  it("flag ON: initialUiFlag mounts the V2 skeleton, never the legacy surface", async () => {
    renderSeam(true);

    expect(await screen.findByTestId("ui-v2-dashboard-teams")).toBeTruthy();
    // Never both surfaces: the legacy section heading id must not exist, and
    // the legacy Overview landmark must not be mounted beside V2.
    expect(document.getElementById("dashboard-teams-heading")).toBeNull();
    expect(screen.queryByLabelText("Overview")).toBeNull();
  });

  it("flag OFF without a provider: the legacy surface mounts, never V2", async () => {
    renderSeam();

    await waitFor(() =>
      expect(document.getElementById("dashboard-teams-heading")).toBeTruthy(),
    );
    expect(screen.queryByTestId("ui-v2-dashboard-teams")).toBeNull();
  });

  it("flag OFF with the provider seeded false: the legacy surface mounts", async () => {
    renderSeam(false);

    await waitFor(() =>
      expect(document.getElementById("dashboard-teams-heading")).toBeTruthy(),
    );
    expect(screen.queryByTestId("ui-v2-dashboard-teams")).toBeNull();
  });

  it("passes the seam props through to the V2 header (identical contract)", async () => {
    renderSeam(true, "Coach");

    expect(await screen.findByTestId("ui-v2-dashboard-teams")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Welcome back, Coach" }),
    ).toBeTruthy();
    expect(document.getElementById("dashboard-teams-heading")).toBeNull();
  });
});

describe("DashboardV2 skeleton (task 1.3)", () => {
  it("renders the navigable Your teams link with the legacy ready-to-improve copy", async () => {
    renderSeam(true);

    const section = await screen.findByTestId("ui-v2-dashboard-teams");
    const link = within(section).getByRole("link", { name: /ready to improve/i });
    expect(link.getAttribute("href")).toBe("/teams");
    // English home chrome (repo convention) for the zone heading.
    expect(within(section).getByRole("heading", { name: "Your teams" })).toBeTruthy();
  });

  it("keeps every legacy marker out of the V2 markup (never both, UIR-2)", async () => {
    renderSeam(true);

    await screen.findByTestId("ui-v2-dashboard-teams");
    expect(document.getElementById("dashboard-teams-heading")).toBeNull();
    expect(document.getElementById("dashboard-next-match-heading")).toBeNull();
    expect(document.getElementById("dashboard-leagues-heading")).toBeNull();
    expect(screen.queryByLabelText("Overview")).toBeNull();
    expect(screen.queryByLabelText("Quick actions")).toBeNull();
  });
});
