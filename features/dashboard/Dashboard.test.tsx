import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { AppProvider } from "@/app/providers/AppProvider";
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import { DEFAULT_COACHING, type Team } from "@/features/teams/types";
import { Dashboard } from "./Dashboard";

const me = "u1";

const sessionMock = vi.hoisted(() =>
  vi.fn(() => ({ data: { user: { id: me } }, status: "authenticated" })),
);
vi.mock("next-auth/react", () => ({
  useSession: () => sessionMock(),
}));

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Dashboard", () => {
  it("shows the welcome header, stats, quick actions, teams and my leagues", async () => {
    stubLeaguesFetch();
    render(
      <AppProvider store={new InMemoryTeamStore(teams)} authenticated>
        <Dashboard authenticated userName="Coach" />
      </AppProvider>,
    );

    expect(screen.getByRole("heading", { name: "Welcome back, Coach" })).toBeTruthy();
    expect(screen.getByText("Your league at a glance.")).toBeTruthy();

    // Wait for the team store hydration + leagues fetch, then assert stats.
    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());
    const overview = screen.getByLabelText("Overview");
    // Stat cards: 2 teams, 1 my-league (owned only).
    expect(within(overview).getByText("2")).toBeTruthy();
    expect(within(overview).getByText("1")).toBeTruthy();

    // Quick actions.
    expect(screen.getByRole("link", { name: "Create team" }).getAttribute("href")).toBe(
      "/teams/create",
    );
    expect(screen.getByRole("link", { name: "Create league" }).getAttribute("href")).toBe(
      "/leagues",
    );

    // My teams (TeamList embedded).
    expect(screen.getByText("Dwarf Wall")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Equipos" })).toBeTruthy();

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
