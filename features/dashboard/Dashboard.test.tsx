import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { AppProvider } from "@/app/providers/AppProvider";
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import { DEFAULT_COACHING, type Team } from "@/features/teams/types";
import type { DashboardFixture, DashboardPayload } from "@/app/api/me/dashboard/route";
import { formatMatchDate } from "@/features/leagues/MatchCard";
import { formatRulebookCost } from "@/features/teams/format";
import { Dashboard } from "./Dashboard";

const me = "u1";

/** Session mock shape: `role` is optional so tests can simulate a developer. */
interface SessionShape {
  data: { user: { id: string; role?: string } };
  status: string;
}

const sessionMock = vi.hoisted(() =>
  vi.fn(
    (): SessionShape => ({ data: { user: { id: me } }, status: "authenticated" }),
  ),
);
vi.mock("next-auth/react", () => ({
  useSession: () => sessionMock(),
}));

/** LAC-5: overrides the session with an optional JWT role snapshot. */
function setSession(role?: string) {
  sessionMock.mockReturnValue({
    data: { user: role ? { id: me, role } : { id: me } },
    status: "authenticated",
  });
}

const teams: Team[] = [
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

const leaguesResponse = [
  // My own open league → counts toward the Leagues stat and the My leagues list.
  { id: "l1", name: "North Reikland", ownerId: me, status: "open", memberCount: 1, isMember: false },
  // A foreign OPEN league I did not join → excluded from the dashboard list.
  { id: "l2", name: "Foreign Open Cup", ownerId: "u2", status: "open", memberCount: 5, isMember: false },
];

function stubLeaguesFetch(status = 200) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/leagues") {
      if (status !== 200) {
        return Promise.resolve({ ok: false, status, json: () => Promise.resolve({ error: "Unauthorized" }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(leaguesResponse) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A dashboard payload with nothing pending (the common case). */
function emptyInbox(overrides: Partial<DashboardPayload> = {}): DashboardPayload {
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
function inboxFixture(overrides: Partial<DashboardFixture> = {}): DashboardFixture {
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

/** Serves BOTH `/api/leagues` and `/api/me/dashboard` from a single stub. */
function stubInbox(payload: DashboardPayload, leagues: unknown[] = []) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/leagues") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(leagues) });
    }
    if (url === "/api/me/dashboard") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The authenticated render used by the #268 zone tests. */
function renderDashboard() {
  return render(
    <AppProvider store={new InMemoryTeamStore(teams)} authenticated>
      <Dashboard authenticated userName="Coach" />
    </AppProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  setSession();
});

describe("Dashboard", () => {
  it("shows the welcome header, stats, team summary and my leagues", async () => {
    stubLeaguesFetch();
    render(
      <AppProvider store={new InMemoryTeamStore(teams)} authenticated>
        <Dashboard authenticated userName="Coach" />
      </AppProvider>,
    );

    expect(screen.getByRole("heading", { name: "Welcome back, Coach" })).toBeTruthy();
    expect(screen.getByText("Your league at a glance.")).toBeTruthy();

    // Wait for the team store hydration (the summary only renders hydrated),
    // then assert the stat cards: 2 teams, 1 my-league (owned only). The
    // career cards stay hidden — the stub 404s GET /api/me/stats.
    await waitFor(() => expect(screen.getByText(/2 teams/)).toBeTruthy());
    const overview = screen.getByLabelText("Overview");
    expect(within(overview).getByText("2")).toBeTruthy();
    expect(within(overview).getByText("1")).toBeTruthy();

    // Quick actions are state-driven: teams AND a league exist, so neither the
    // "Create team" nor the "Join/Find a league" action renders (nothing is
    // owed either, so no "Report result").
    expect(screen.queryByRole("link", { name: "Create team" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Join/Find a league" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Report result" })).toBeNull();

    // Compact team summary (the embedded list moved to /teams in #268).
    expect(screen.getByRole("heading", { name: "Your teams" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /2 teams/ }).getAttribute("href")).toBe("/teams");

    // My leagues: owned only, never the foreign open league.
    await waitFor(() => expect(screen.getByText("North Reikland")).toBeTruthy());
    expect(screen.queryByText("Foreign Open Cup")).toBeNull();
    expect(screen.getByRole("heading", { name: "Mis Ligas" })).toBeTruthy();
  });

  it("renders the welcome header without a name and the leagues empty state in local mode", async () => {
    stubLeaguesFetch(401);
    render(
      <AppProvider store={new InMemoryTeamStore(teams)}>
        <Dashboard authenticated={false} userName={null} />
      </AppProvider>,
    );

    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeTruthy();
    // The 401 is swallowed: the section renders the leagues empty state.
    await waitFor(() => expect(screen.getByText(/Aún no tienes ligas/)).toBeTruthy());
    expect(screen.queryByText("Unauthorized")).toBeNull();
  });
});

describe("Dashboard — LAC-5 owner-equivalent leagues", () => {
  /** The "Leagues" stat card, isolated so its count is unambiguous. */
  function leaguesStat(): HTMLElement {
    return screen.getByText("Leagues").closest("div") as HTMLElement;
  }

  function stubLeagues(leagues: unknown[]) {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/leagues") {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(leagues) });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("lands a foreign league in My leagues for a developer session via the predicate", async () => {
    setSession("developer");
    stubLeaguesFetch();
    render(
      <AppProvider store={new InMemoryTeamStore(teams)} authenticated>
        <Dashboard authenticated userName="Coach" />
      </AppProvider>,
    );

    // The foreign open league (l2) is now owner-equivalent → rendered + counted.
    await waitFor(() => expect(screen.getByText("Foreign Open Cup")).toBeTruthy());
    expect(leaguesStat().textContent).toContain("2");
  });

  it("lands a foreign league flagged canManage in My leagues (server flag preferred)", async () => {
    stubLeagues([
      { id: "l2", name: "Foreign Open Cup", ownerId: "u2", status: "open", memberCount: 5, isMember: false, canManage: true },
    ]);
    render(
      <AppProvider store={new InMemoryTeamStore(teams)} authenticated>
        <Dashboard authenticated userName="Coach" />
      </AppProvider>,
    );

    await waitFor(() => expect(screen.getByText("Foreign Open Cup")).toBeTruthy());
    expect(leaguesStat().textContent).toContain("1");
  });

  it("keeps a plain user's My leagues to owned/joined only", async () => {
    setSession("user");
    stubLeaguesFetch();
    render(
      <AppProvider store={new InMemoryTeamStore(teams)} authenticated>
        <Dashboard authenticated userName="Coach" />
      </AppProvider>,
    );

    await waitFor(() => expect(screen.getByText("North Reikland")).toBeTruthy());
    expect(screen.queryByText("Foreign Open Cup")).toBeNull();
    expect(leaguesStat().textContent).toContain("1");
  });
});

describe("Dashboard — pending attention (issue #268)", () => {
  it("renders a rival date proposal as an actionable item linking to the fixture", async () => {
    stubInbox(
      emptyInbox({
        proposals: [
          inboxFixture({
            fixtureId: "f-props",
            leagueId: "l9",
            leagueName: "Pretemporada Cup",
            status: "pending",
            pendingProposal: {
              id: "pr1",
              date: "2026-10-05T18:00:00.000Z",
              createdAt: "2026-09-30T10:00:00.000Z",
            },
          }),
        ],
      }),
    );
    renderDashboard();

    const link = await screen.findByRole("link", { name: /Date proposal/ });
    expect(link.getAttribute("href")).toBe("/leagues/l9/fixtures/f-props");
    expect(screen.getByRole("heading", { name: "Needs your attention" })).toBeTruthy();
  });

  it("renders a live fixture with the LIVE indicator", async () => {
    stubInbox(
      emptyInbox({
        live: [
          inboxFixture({
            fixtureId: "f-live",
            live: { status: "live", homeScore: 1, awayScore: 0, half: 2, turnNumber: 4 },
          }),
        ],
      }),
    );
    renderDashboard();

    // Locale-aware badge: "EN VIVO" (es default) or "LIVE" (en).
    const link = await screen.findByRole("link", { name: /EN VIVO|LIVE/ });
    expect(link.getAttribute("href")).toBe("/leagues/l1/fixtures/f-live");
  });

  it("renders a result-owed fixture with the report affordance", async () => {
    stubInbox(emptyInbox({ resultsPending: [inboxFixture({ fixtureId: "f-res" })] }));
    renderDashboard();

    // Scoped to the zone: the "Report result" quick action (issue #268) links
    // to the same fixture OUTSIDE the attention list.
    const region = await screen.findByRole("region", { name: "Needs your attention" });
    const link = within(region).getByRole("link", { name: /Report result/ });
    expect(link.getAttribute("href")).toBe("/leagues/l1/fixtures/f-res");
  });

  it("shows a re-negotiating fixture ONCE (the proposal wins over result-owed)", async () => {
    // Rejornar leaves `scheduledAt` untouched, so the same fixture satisfies
    // both predicates. Two rows for one match would make the triage list look
    // broken, so the date answer takes priority.
    const fixture = inboxFixture({ fixtureId: "f-rejornar" });
    stubInbox(emptyInbox({ proposals: [fixture], resultsPending: [fixture] }));
    renderDashboard();

    expect(await screen.findByRole("link", { name: /Respond/ })).toBeTruthy();
    // Scoped to the zone: the quick action outside it may legitimately offer
    // "Report result" for the same payload.
    const region = screen.getByRole("region", { name: "Needs your attention" });
    expect(within(region).queryByRole("link", { name: /Report result/ })).toBeNull();
  });

  it("surfaces an open league awaiting start from the already-loaded list", async () => {
    stubInbox(emptyInbox(), [
      { id: "l3", name: "Spring Cup", ownerId: "u9", status: "open", memberCount: 4, isMember: true, canManage: false },
    ]);
    renderDashboard();

    const link = await screen.findByRole("link", { name: /awaiting start/ });
    expect(link.getAttribute("href")).toBe("/leagues/l3");
    expect(link.textContent).toContain("Spring Cup");
  });

  it("shows the calm empty state and no zone-1 content on an empty payload", async () => {
    stubInbox(emptyInbox());
    renderDashboard();

    const region = await screen.findByRole("region", { name: "Needs your attention" });
    expect(within(region).getByText("Nothing needs your attention right now.")).toBeTruthy();
    expect(within(region).queryByRole("link")).toBeNull();
  });

  it("keeps the zone hidden while the inbox is loading", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/leagues") {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
      }
      if (url === "/api/me/dashboard") {
        return new Promise(() => undefined); // never settles
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderDashboard();

    // `waitFor` wraps its callback in act(), so the `/api/leagues` promise that
    // settles in here does not leak an un-wrapped state update into the log.
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Needs your attention" })).toBeNull();
      expect(screen.queryByText("Nothing needs your attention right now.")).toBeNull();
    });
  });

  it("shows an in-play fixture ONCE, as LIVE — never as a dead Respond card", async () => {
    // `propose` has no live-match guard and the live flow never closes a
    // ScheduleProposal, so a fixture can be in both arrays at once. While the
    // match runs `MatchCard` hides negotiation, so the proposal row would link
    // to an affordance that is not there.
    const fixture = inboxFixture({ fixtureId: "f-inplay" });
    stubInbox(emptyInbox({ proposals: [fixture], live: [fixture] }));
    renderDashboard();

    const link = await screen.findByRole("link", { name: /EN VIVO|LIVE/ });
    expect(link.getAttribute("href")).toBe("/leagues/l1/fixtures/f-inplay");
    expect(screen.queryByRole("link", { name: /Respond/ })).toBeNull();
  });

  it("offers each quick action only while its condition holds", async () => {
    // Zero teams + zero leagues + one result owed → all three actions render.
    stubInbox(emptyInbox({ resultsPending: [inboxFixture({ fixtureId: "f-quick" })] }));
    render(
      <AppProvider store={new InMemoryTeamStore([])} authenticated>
        <Dashboard authenticated userName="Coach" />
      </AppProvider>,
    );

    // `findBy*`: the store-backed actions are gated on `isHydrated`, which only
    // flips once AppProvider's effect has run — a synchronous query would read
    // the pre-hydration frame where the section is deliberately absent.
    const actions = await screen.findByLabelText("Quick actions");
    expect(
      (await within(actions).findByRole("link", { name: "Create team" })).getAttribute("href"),
    ).toBe("/teams/create");
    expect(
      within(actions).getByRole("link", { name: "Join/Find a league" }).getAttribute("href"),
    ).toBe("/leagues");
    expect(
      within(actions).getByRole("link", { name: "Report result" }).getAttribute("href"),
    ).toBe("/leagues/l1/fixtures/f-quick");
  });
});

describe("Dashboard — next match + squad PE (issue #268)", () => {
  it("renders the next match as ONE link to the fixture, with round and formatted date", async () => {
    stubInbox(emptyInbox({ nextMatch: inboxFixture() }));
    renderDashboard();

    const region = await screen.findByRole("region", { name: "Next match" });
    const link = within(region).getByRole("link");
    expect(link.getAttribute("href")).toBe("/leagues/l1/fixtures/f1");
    expect(link.textContent).toContain("Pretemporada Cup · Round 2");
    expect(link.textContent).toContain("Reikland Reavers vs Chaos Crushers");
    // Footer: English status word + the shared date helper (same machine, so
    // the locale/timezone formatting matches the component's output exactly).
    expect(link.textContent).toContain("Scheduled");
    expect(link.textContent).toContain(formatMatchDate("2026-10-05T18:00:00.000Z"));
  });

  it("omits the Next match landmark entirely when the payload has no next fixture", async () => {
    stubInbox(emptyInbox());
    renderDashboard();

    // The inbox resolved (the attention region landed) and STILL no landmark:
    // the common no-fixture case must never render an empty labelled section.
    await screen.findByRole("region", { name: "Needs your attention" });
    expect(screen.queryByRole("heading", { name: "Next match" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Next match" })).toBeNull();
  });

  it("shows the LIVE badge on a live next match", async () => {
    stubInbox(
      emptyInbox({
        nextMatch: inboxFixture({
          live: { status: "live", homeScore: 1, awayScore: 0, half: 2, turnNumber: 4 },
        }),
      }),
    );
    renderDashboard();

    const region = await screen.findByRole("region", { name: "Next match" });
    // Locale-aware badge: "EN VIVO" (es default) or "LIVE" (en) — scoped to
    // the zone so the attention list can never satisfy the assertion.
    expect(within(region).getByRole("link", { name: /EN VIVO|LIVE/ }).getAttribute("href")).toBe(
      "/leagues/l1/fixtures/f1",
    );
  });

  it("shows the squad PE total from the dashboard payload", async () => {
    stubInbox(emptyInbox({ teams: { count: 2, readyToImprove: 1, squadPe: 12340 } }));
    renderDashboard();

    const overview = screen.getByLabelText("Overview");
    expect(await within(overview).findByText("Squad PE")).toBeTruthy();
    expect(within(overview).getByText(formatRulebookCost(12340))).toBeTruthy();
  });
});
