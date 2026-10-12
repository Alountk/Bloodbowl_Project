import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppProvider } from "@/app/providers/AppProvider";
import { UiFlagProvider } from "@/lib/ui-flag";
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import type { Team } from "../types";
import { DEFAULT_COACHING } from "../types";
import { TeamsListViewV2 } from "./TeamsListViewV2";
import Page from "@/app/teams/page";

/**
 * TeamsListViewV2 + seam tests (task 1.1, UIR-2) — SLICE 1.
 *
 * Pins the second declared seam (`app/teams/page.tsx`):
 *  - flag ON (`UiFlagProvider initialUiFlag`) → the V2 skeleton mounts
 *    (`ui-v2-teams-grid` + provider-backed team rows), the legacy surface
 *    never does;
 *  - flag OFF (provider absent OR `initialUiFlag={false}`) → the legacy
 *    `TeamsPage` mounts (`#teams-unassigned-heading`), V2 never does;
 *  - presentation-only: the V2 source must not import `features/teams/api`.
 *
 * The legacy surface behind the seam fetches the league-name map (one
 * `listLeagues` call) and each TeamCard its own progression — both stubbed
 * (app/teams/page.test.tsx pattern).
 */
vi.mock("@/features/teams/api", () => ({
  fetchTeamProgression: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/features/leagues/api", () => ({
  listLeagues: vi.fn().mockResolvedValue([]),
}));

/** One unassigned + one assigned team so BOTH sections render somewhere. */
const seededTeam: Team = {
  id: "team-1",
  name: "Reikland Reavers",
  raceId: "human",
  leagueId: null,
  coaching: { ...DEFAULT_COACHING },
  treasury: 0,
  roster: [],
};

const assignedTeam: Team = {
  id: "team-2",
  name: "Da Krumpaz",
  raceId: "orc",
  leagueId: "league-42",
  coaching: { ...DEFAULT_COACHING },
  treasury: 0,
  roster: [],
};

/**
 * Renders the ROUTE PAGE (the seam itself) the way the root layout mounts it:
 * `AppProvider` for the team store, plus `UiFlagProvider` only when a flag
 * value is given (absent provider must fall back to legacy — UIR-1).
 */
function renderSeam(uiFlag?: boolean) {
  const page = <Page />;
  return render(
    <AppProvider store={new InMemoryTeamStore([seededTeam, assignedTeam])}>
      {uiFlag === undefined ? (
        page
      ) : (
        <UiFlagProvider initialUiFlag={uiFlag}>{page}</UiFlagProvider>
      )}
    </AppProvider>,
  );
}

describe("teams list seam (UIR-2): app/teams/page.tsx", () => {
  it("flag ON: initialUiFlag mounts the V2 skeleton, never the legacy surface", async () => {
    renderSeam(true);

    expect(await screen.findByTestId("ui-v2-teams-grid")).toBeTruthy();
    // Provider data flows through the zero-props V2: the seeded team is
    // reachable (navigation parity with the legacy TeamCard link).
    expect(screen.getByTestId("ui-v2-teams-card-team-1")).toBeTruthy();
    // Never both surfaces: the legacy section heading id must not exist.
    expect(document.getElementById("teams-unassigned-heading")).toBeNull();
  });

  it("flag OFF without a provider: the legacy surface mounts, never V2", async () => {
    renderSeam();

    await waitFor(() =>
      expect(document.getElementById("teams-unassigned-heading")).toBeTruthy(),
    );
    expect(screen.queryByTestId("ui-v2-teams-grid")).toBeNull();
    expect(screen.queryByTestId("ui-v2-teams-card-team-1")).toBeNull();
  });

  it("flag OFF with the provider seeded false: the legacy surface mounts", async () => {
    renderSeam(false);

    await waitFor(() =>
      expect(document.getElementById("teams-unassigned-heading")).toBeTruthy(),
    );
    expect(screen.queryByTestId("ui-v2-teams-grid")).toBeNull();
    expect(screen.queryByTestId("ui-v2-teams-card-team-1")).toBeNull();
  });
});

describe("TeamsListViewV2 skeleton (slice 1)", () => {
  it("renders the grid, both leagueId sections and the navigation rows with zero props", async () => {
    render(
      <AppProvider store={new InMemoryTeamStore([seededTeam, assignedTeam])}>
        <TeamsListViewV2 />
      </AppProvider>,
    );

    expect(await screen.findByTestId("ui-v2-teams-grid")).toBeTruthy();
    expect(screen.getByTestId("ui-v2-teams-section-unassigned")).toBeTruthy();
    expect(screen.getByTestId("ui-v2-teams-section-assigned")).toBeTruthy();

    // Navigation rows: the detail route stays reachable from the V2 list —
    // the flag-ON e2e harness (and real flag-ON users) depend on it, since
    // the local store dies on reload and home/nav carry no team links.
    const card = screen.getByTestId("ui-v2-teams-card-team-1");
    const link = card.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/teams/team-1");
    expect(link?.textContent).toBe("Reikland Reavers");
    expect(screen.getByTestId("ui-v2-teams-card-team-2")).toBeTruthy();

    // Legacy heading ids are never reused by V2 (never-both vocabulary).
    expect(document.getElementById("teams-unassigned-heading")).toBeNull();
  });

  it("stays presentation-only: no features/teams/api import (UIR-2)", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const content = readFileSync(path.join(dir, "TeamsListViewV2.tsx"), "utf8");
    const specifiers = Array.from(content.matchAll(/from\s+["']([^"']+)["']/g)).map(
      (m) => m[1],
    );
    expect(
      specifiers.find((s) => s.endsWith("features/teams/api")),
      "TeamsListViewV2 must not import features/teams/api",
    ).toBeUndefined();
  });
});
