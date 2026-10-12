import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { UiFlagProvider } from "@/lib/ui-flag";
import { AppProvider } from "@/app/providers/AppProvider";
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import { DEFAULT_COACHING, type Team } from "@/features/teams/types";
import type {
  DashboardFixture,
  DashboardPayload,
} from "@/app/api/me/dashboard/route";
import type { CareerStats } from "@/features/profile/api";
import { formatMatchDate } from "@/features/leagues/MatchCard";
import { formatRulebookCost } from "@/features/teams/format";
import { getRaceById } from "@/features/teams/data/races";
import {
  computeCoachingCost,
  computeRosterCostFromPlayers,
} from "@/features/teams/roster";
import { HomeDashboard } from "./HomeDashboard";
import { DashboardV2 } from "./DashboardV2";

/**
 * DashboardV2 + seam tests (tasks 1.1, 1.3 and 2.1, UIR-2).
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
 * Slice 2 (task 2.1) pins the FINISHED V2 zones against the same data
 * channel legacy uses: the attention zone (proposals / LIVE / results owed),
 * the next-match card (league, round, teams, date or "No date", LIVE badge),
 * the 2×2/4 stat cards (Teams, Leagues, Matches + W-D-L, Squad PE), the
 * "Your teams" cards (emblem, name, race, TV + the harness link) and the
 * "My leagues" cards — English home chrome, no legacy markers, and NO fetch
 * beyond the legacy endpoints (`/api/leagues`, `/api/me/dashboard`,
 * `/api/me/stats`).
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

/* ------------------------------------------------------------------ *
 * Slice 2 — full V2 zones (task 2.1), same data channel as legacy.   *
 * ------------------------------------------------------------------ */

const zoneTeams: Team[] = [
  {
    id: "team-1",
    name: "Reikland Reavers",
    raceId: "human",
    coaching: { ...DEFAULT_COACHING },
    leagueId: null,
    treasury: 0,
    roster: [
      { id: "p1", name: "Player 1", positionalKey: "lineman" },
      { id: "p2", name: "Player 2", positionalKey: "lineman" },
    ],
  },
  {
    id: "team-2",
    name: "Dwarf Wall",
    raceId: "dwarf",
    coaching: { ...DEFAULT_COACHING },
    leagueId: null,
    treasury: 0,
    roster: [{ id: "p3", name: "Player 3", positionalKey: "lineman" }],
  },
];

/** One joined league (mine) + one foreign open league (never rendered). */
const zoneLeagues = [
  {
    id: "l1",
    name: "North Reikland",
    ownerId: "u2",
    status: "open",
    memberCount: 2,
    isMember: true,
  },
  {
    id: "l2",
    name: "Foreign Open Cup",
    ownerId: "u3",
    status: "open",
    memberCount: 5,
    isMember: false,
  },
];

const zoneStats: CareerStats = {
  championships: 0,
  teams: 2,
  leaguesOwned: 1,
  leaguesMember: 0,
  leagues: 1,
  matches: 5,
  wins: 2,
  draws: 1,
  losses: 2,
};

/** A dashboard payload with nothing pending (the common case). */
function zoneInbox(overrides: Partial<DashboardPayload> = {}): DashboardPayload {
  return {
    proposals: [],
    live: [],
    resultsPending: [],
    nextMatch: null,
    teams: { count: 0, readyToImprove: 0, squadPe: 0 },
    ...overrides,
  };
}

/** A `GET /api/me/dashboard` fixture; defaults to a scheduled viewer-away match. */
function zoneFixture(overrides: Partial<DashboardFixture> = {}): DashboardFixture {
  return {
    fixtureId: "f1",
    leagueId: "l1",
    leagueName: "Pretemporada Cup",
    round: 2,
    scheduledAt: "2026-10-05T18:00:00.000Z",
    homeTeam: { id: "t-home", name: "Reikland Reavers" },
    awayTeam: { id: "t-away", name: "Chaos Crushers" },
    viewerSide: "away",
    status: "scheduled",
    pendingProposal: null,
    live: null,
    ...overrides,
  };
}

/**
 * Renders the FINISHED V2 surface directly (the seam contract is pinned
 * above) over an in-memory team store — the exact channels legacy's own test
 * uses — and stubs the three legacy dashboard endpoints. Every requested URL
 * is recorded so the presentation-only contract (no new endpoint) is
 * assertable.
 */
function renderV2(
  payload: DashboardPayload,
  leagues: unknown[] = [],
  stats: CareerStats | null = null,
) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url === "/api/leagues") {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(leagues) });
      }
      if (url === "/api/me/dashboard") {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) });
      }
      if (url === "/api/me/stats" && stats) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(stats) });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Not found" }),
      });
    }),
  );
  render(
    <AppProvider store={new InMemoryTeamStore(zoneTeams)} authenticated>
      <DashboardV2 authenticated userName="Coach" />
    </AppProvider>,
  );
  return { urls };
}

describe("DashboardV2 — Needs your attention (task 2.1)", () => {
  it("renders proposal, LIVE and result-owed rows from the inbox payload", async () => {
    renderV2(
      zoneInbox({
        proposals: [
          zoneFixture({
            fixtureId: "f-props",
            leagueId: "l9",
            status: "pending",
            pendingProposal: {
              id: "pr1",
              date: "2026-10-05T18:00:00.000Z",
              createdAt: "2026-09-30T10:00:00.000Z",
            },
          }),
        ],
        live: [
          zoneFixture({
            fixtureId: "f-live",
            live: { status: "live", homeScore: 1, awayScore: 0, half: 2, turnNumber: 4 },
          }),
        ],
        resultsPending: [zoneFixture({ fixtureId: "f-res" })],
      }),
    );

    const zone = await screen.findByTestId("ui-v2-dashboard-attention");
    expect(
      within(zone).getByRole("heading", { name: "Needs your attention" }),
    ).toBeTruthy();
    // Pending date proposal → links to the fixture, English "Respond" chip.
    const proposal = within(zone).getByRole("link", { name: /Date proposal/ });
    expect(proposal.getAttribute("href")).toBe("/leagues/l9/fixtures/f-props");
    expect(within(zone).getByRole("link", { name: /Respond/ })).toBeTruthy();
    // LIVE match → red badge (locale-aware EN VIVO / LIVE) linking to the fixture.
    const liveRow = within(zone).getByRole("link", { name: /EN VIVO|LIVE/ });
    expect(liveRow.getAttribute("href")).toBe("/leagues/l1/fixtures/f-live");
    // Pending result → report affordance linking to the fixture (the acta).
    const result = within(zone).getByRole("link", { name: /Report result/ });
    expect(result.getAttribute("href")).toBe("/leagues/l1/fixtures/f-res");
  });
});

describe("DashboardV2 — Next match (task 2.1)", () => {
  it("renders league, round, both teams and the scheduled date as one card link", async () => {
    renderV2(zoneInbox({ nextMatch: zoneFixture() }));

    const zone = await screen.findByTestId("ui-v2-dashboard-next-match");
    expect(within(zone).getByRole("heading", { name: "Next match" })).toBeTruthy();
    const link = within(zone).getByRole("link");
    expect(link.getAttribute("href")).toBe("/leagues/l1/fixtures/f1");
    expect(link.textContent).toContain("Pretemporada Cup");
    expect(link.textContent).toContain("Round 2");
    expect(link.textContent).toContain("Reikland Reavers vs Chaos Crushers");
    expect(link.textContent).toContain(formatMatchDate("2026-10-05T18:00:00.000Z"));
    expect(link.textContent).not.toContain("No date");
  });

  it("falls back to 'No date' when the fixture carries no scheduled date", async () => {
    renderV2(
      zoneInbox({
        nextMatch: zoneFixture({ fixtureId: "f-nodate", scheduledAt: null, status: "pending" }),
      }),
    );

    const zone = await screen.findByTestId("ui-v2-dashboard-next-match");
    expect(zone.textContent).toContain("No date");
  });

  it("shows the LIVE badge when the next match is in play", async () => {
    renderV2(
      zoneInbox({
        nextMatch: zoneFixture({
          live: { status: "live", homeScore: 1, awayScore: 0, half: 2, turnNumber: 4 },
        }),
      }),
    );

    const zone = await screen.findByTestId("ui-v2-dashboard-next-match");
    expect(within(zone).getByRole("link", { name: /EN VIVO|LIVE/ }).getAttribute("href")).toBe(
      "/leagues/l1/fixtures/f1",
    );
  });
});

describe("DashboardV2 — Stat cards (task 2.1)", () => {
  it("shows Teams, Leagues, Matches with W-D-L and Squad PE in a 2×2 / 4-across grid", async () => {
    renderV2(
      zoneInbox({ teams: { count: 2, readyToImprove: 1, squadPe: 12340 } }),
      zoneLeagues,
      zoneStats,
    );

    const zone = await screen.findByTestId("ui-v2-dashboard-stats");
    // Mobile 2×2 → desktop 4-across (Stitch "M 04" / "04", CSS-only per design).
    expect(zone.className).toContain("grid-cols-2");
    expect(zone.className).toContain("lg:grid-cols-4");

    // Teams/Leagues settle once the store hydrates and the leagues list lands.
    await waitFor(() => {
      expect(
        within(screen.getByTestId("ui-v2-dashboard-stat-teams")).getByText("2"),
      ).toBeTruthy();
      expect(
        within(screen.getByTestId("ui-v2-dashboard-stat-leagues")).getByText("1"),
      ).toBeTruthy();
    });
    const teamsCard = screen.getByTestId("ui-v2-dashboard-stat-teams");
    expect(within(teamsCard).getByText("Teams")).toBeTruthy();
    const leaguesCard = screen.getByTestId("ui-v2-dashboard-stat-leagues");
    expect(within(leaguesCard).getByText("Leagues")).toBeTruthy();

    const matchesCard = screen.getByTestId("ui-v2-dashboard-stat-matches");
    expect(within(matchesCard).getByText("5")).toBeTruthy();
    expect(within(matchesCard).getByText("Matches")).toBeTruthy();
    expect(within(matchesCard).getByText("W-D-L 2-1-2")).toBeTruthy();

    const squadCard = screen.getByTestId("ui-v2-dashboard-stat-squad-pe");
    expect(within(squadCard).getByText(formatRulebookCost(12340))).toBeTruthy();
    expect(within(squadCard).getByText("Squad PE")).toBeTruthy();
  });

  it("hides the feed-backed cards while their endpoints never resolve (no flash)", async () => {
    // /api/me/dashboard never settles and /api/me/stats 404s → Matches and
    // Squad PE stay hidden (same no-flash rule as legacy); only the
    // store/list-backed cards render.
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/leagues") {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
        }
        if (url === "/api/me/dashboard") {
          return new Promise(() => undefined); // never settles
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ error: "Not found" }),
        });
      }),
    );
    render(
      <AppProvider store={new InMemoryTeamStore(zoneTeams)} authenticated>
        <DashboardV2 authenticated userName="Coach" />
      </AppProvider>,
    );

    const zone = await screen.findByTestId("ui-v2-dashboard-stats");
    await waitFor(() =>
      expect(
        within(screen.getByTestId("ui-v2-dashboard-stat-teams")).getByText("2"),
      ).toBeTruthy(),
    );
    expect(screen.queryByTestId("ui-v2-dashboard-stat-matches")).toBeNull();
    expect(screen.queryByTestId("ui-v2-dashboard-stat-squad-pe")).toBeNull();
    expect(within(zone).getByTestId("ui-v2-dashboard-stat-leagues")).toBeTruthy();
    expect(screen.queryByTestId("ui-v2-dashboard-attention")).toBeNull();
    expect(screen.queryByTestId("ui-v2-dashboard-next-match")).toBeNull();
  });
});

describe("DashboardV2 — Your teams (task 2.1)", () => {
  it("renders per-team cards (emblem, name, race, TV) plus the harness link", async () => {
    renderV2(zoneInbox({ teams: { count: 2, readyToImprove: 1, squadPe: 0 } }));

    const zone = await screen.findByTestId("ui-v2-dashboard-teams");
    await waitFor(() =>
      expect(within(zone).getByTestId("ui-v2-dashboard-team-card-team-1")).toBeTruthy(),
    );

    const card = within(zone).getByTestId("ui-v2-dashboard-team-card-team-1");
    const link = within(card).getByRole("link");
    expect(link.getAttribute("href")).toBe("/teams/team-1");
    expect(link.textContent).toContain("Reikland Reavers");
    const human = getRaceById("human");
    expect(human).toBeTruthy();
    expect(link.textContent).toContain(human?.name);
    // Presentation-only TV: roster + coaching cost (no progression fetch).
    const tv = human
      ? computeRosterCostFromPlayers(human, zoneTeams[0].roster) +
        computeCoachingCost(human, zoneTeams[0].coaching)
      : 0;
    expect(link.textContent).toContain(formatRulebookCost(tv));
    expect(within(card).getByTestId("emblem-team-1")).toBeTruthy();

    // The slice-1 harness contract survives the full translation.
    const summary = within(zone).getByRole("link", { name: /ready to improve/i });
    expect(summary.getAttribute("href")).toBe("/teams");
    expect(summary.textContent).toContain("1 ready to improve");
  });
});

describe("DashboardV2 — My leagues (task 2.1)", () => {
  it("renders joined league cards with a status badge, never the foreign league", async () => {
    renderV2(zoneInbox(), zoneLeagues);

    const zone = await screen.findByTestId("ui-v2-dashboard-leagues");
    // English home chrome (repo convention) for the zone heading.
    expect(within(zone).getByRole("heading", { name: "My leagues" })).toBeTruthy();
    await waitFor(() => expect(within(zone).getByText("North Reikland")).toBeTruthy());
    expect(within(zone).queryByText("Foreign Open Cup")).toBeNull();
    // Status badge from the reused LeagueCard (open → Abierta/Open).
    expect(within(zone).getByText(/Abierta|Open/)).toBeTruthy();
  });
});

describe("DashboardV2 — chrome, markers and data channel (task 2.1)", () => {
  it("keeps English chrome + legacy markers out and fetches only legacy endpoints", async () => {
    const { urls } = renderV2(
      zoneInbox({
        nextMatch: zoneFixture(),
        resultsPending: [zoneFixture({ fixtureId: "f-res" })],
      }),
      zoneLeagues,
      zoneStats,
    );

    await screen.findByTestId("ui-v2-dashboard-next-match");
    await screen.findByTestId("ui-v2-dashboard-leagues");

    // English home chrome (repo convention), zone by zone.
    expect(screen.getByRole("heading", { name: "Welcome back, Coach" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Needs your attention" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Next match" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your teams" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "My leagues" })).toBeTruthy();

    // Never both surfaces (UIR-2): every legacy dashboard marker stays out.
    expect(document.getElementById("dashboard-teams-heading")).toBeNull();
    expect(document.getElementById("dashboard-next-match-heading")).toBeNull();
    expect(document.getElementById("dashboard-leagues-heading")).toBeNull();
    expect(screen.queryByLabelText("Overview")).toBeNull();
    // Results are owed, yet V2 has no legacy Quick actions region at all.
    expect(screen.queryByLabelText("Quick actions")).toBeNull();

    // Presentation-only (UIR-2): only the legacy dashboard data channel.
    const allowed = new Set(["/api/leagues", "/api/me/dashboard", "/api/me/stats"]);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => allowed.has(url))).toBe(true);
    expect(urls).toContain("/api/me/dashboard");
    expect(urls).toContain("/api/me/stats");
  });
});
