import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProvider } from "@/app/providers/AppProvider";
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import type { TeamStore } from "@/features/teams/store/TeamStore";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { TeamList } from "./TeamList";
import type { Team } from "./types";
import { DEFAULT_COACHING, DEFAULT_LEAGUE_TYPE } from "./types";

// The shell renders a route-aware Topbar/Sidebar. `usePathnameMock` is a mutable
// holder accessed through the vi.mock factory; each test sets the current route.
const nav = { pathname: "/" };

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
}));

beforeEach(() => {
  nav.pathname = "/";
});

const fixtureTeams: Team[] = [
  {
    id: "team-1",
    name: "Reikland Reavers",
    raceId: "human",
    coaching: { ...DEFAULT_COACHING },
    leagueType: DEFAULT_LEAGUE_TYPE,
    roster: [
      { id: "p1", name: "Player 1", positionalKey: "lineman" },
      { id: "p2", name: "Player 2", positionalKey: "lineman" },
      { id: "p3", name: "Player 3", positionalKey: "lineman" },
      { id: "p4", name: "Player 4", positionalKey: "lineman" },
      { id: "p5", name: "Player 5", positionalKey: "lineman" },
      { id: "p6", name: "Player 6", positionalKey: "lineman" },
      { id: "p7", name: "Player 7", positionalKey: "lineman" },
      { id: "p8", name: "Player 8", positionalKey: "blitzer" },
      { id: "p9", name: "Player 9", positionalKey: "blitzer" },
      { id: "p10", name: "Player 10", positionalKey: "blitzer" },
      { id: "p11", name: "Player 11", positionalKey: "blitzer" },
    ],
  },
  {
    id: "team-2",
    name: "Da Krumpaz",
    raceId: "orc",
    coaching: { ...DEFAULT_COACHING },
    leagueType: DEFAULT_LEAGUE_TYPE,
    roster: Array.from({ length: 11 }, (_, i) => ({
      id: `op${i}`,
      name: `Player ${i + 1}`,
      positionalKey: "blitzer",
    })),
  },
];

function renderWithStore(teams: Team[] = fixtureTeams) {
  const store = new InMemoryTeamStore(teams);
  render(
    <AppProvider store={store}>
      <TeamList />
    </AppProvider>,
  );
}

function renderWithStoreAndTopbar(teams: Team[] = fixtureTeams) {
  const store = new InMemoryTeamStore(teams);
  render(
    <AppProvider store={store}>
      <Topbar />
      <TeamList />
    </AppProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

class ControlledStore implements TeamStore {
  readonly listCall = deferred<Team[]>();

  list(): Promise<Team[]> {
    return this.listCall.promise;
  }

  save(_team: Team): Promise<Team> {
    void _team;
    throw new Error("not needed in this test");
  }

  remove(_id: string): Promise<void> {
    void _id;
    throw new Error("not needed in this test");
  }
}

describe("TeamList", () => {
  it("renders team name, race name and roster summary", async () => {
    renderWithStore();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Teams" })).toBeTruthy());

    expect(screen.getByText("Reikland Reavers")).toBeTruthy();
    expect(screen.getByText("Human")).toBeTruthy();
    expect(screen.getByText("11 players · 7x Lineman · 4x Blitzer")).toBeTruthy();
    expect(screen.getByText("Da Krumpaz")).toBeTruthy();
    expect(screen.getByText("Orc")).toBeTruthy();
    expect(screen.getByText("11 players · 11x Blitzer")).toBeTruthy();
  });

  it("shows an empty state when there are no teams", async () => {
    renderWithStore([]);
    await waitFor(() => expect(screen.getByText(/no teams yet/i)).toBeTruthy());
  });

  it("does not show the empty state until hydration completes", async () => {
    const store = new ControlledStore();
    render(
      <AppProvider store={store}>
        <TeamList />
      </AppProvider>,
    );

    expect(screen.queryByText(/no teams yet/i)).toBeNull();

    store.listCall.resolve([]);

    await waitFor(() => expect(screen.getByText(/no teams yet/i)).toBeTruthy());
  });

  it("filters by team name from the topbar", async () => {
    renderWithStoreAndTopbar();
    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/search teams/i), {
      target: { value: "reikland" },
    });

    expect(screen.getByText("Reikland Reavers")).toBeTruthy();
    expect(screen.queryByText("Da Krumpaz")).toBeNull();
  });

  it("filters by race name from the topbar", async () => {
    renderWithStoreAndTopbar();
    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/search teams/i), {
      target: { value: "orc" },
    });

    expect(screen.getByText("Da Krumpaz")).toBeTruthy();
    expect(screen.queryByText("Reikland Reavers")).toBeNull();
  });

  it("shows a no-matches message when the query matches nothing", async () => {
    renderWithStoreAndTopbar();
    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/search teams/i), {
      target: { value: "nuffle" },
    });

    expect(screen.getByText(/no teams match your search/i)).toBeTruthy();
  });

  it("each team card has a link to the detail page", async () => {
    renderWithStore();
    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    const link1 = screen.getByRole("link", { name: /reikland reavers/i });
    expect(link1).toBeTruthy();
    expect(link1.getAttribute("href")).toBe("/teams/team-1");

    const link2 = screen.getByRole("link", { name: /da krumpaz/i });
    expect(link2).toBeTruthy();
    expect(link2.getAttribute("href")).toBe("/teams/team-2");
  });

  it("team card links are keyboard-focusable", async () => {
    renderWithStore();
    await waitFor(() =>
      expect(screen.getByText("Reikland Reavers")).toBeTruthy(),
    );

    const link = screen.getByRole("link", { name: /reikland reavers/i });
    link.focus();
    expect(document.activeElement).toBe(link);
  });

  it("search filter works with links present", async () => {
    renderWithStoreAndTopbar();
    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/search teams/i), {
      target: { value: "reikland" },
    });

    expect(screen.getByRole("link", { name: /reikland reavers/i })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /da krumpaz/i })).toBeNull();
  });
});

describe("Sidebar navigation", () => {
  it("shows only the Teams nav item (no Create Team link) on the home route", () => {
    render(
      <AppProvider store={new InMemoryTeamStore()}>
        <Sidebar />
      </AppProvider>,
    );

    expect(screen.getByRole("link", { name: "Teams" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Teams" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("link", { name: /create team/i })).toBeNull();
  });
});

describe("Topbar route-conditional search", () => {
  it("renders the search form on the home route", () => {
    render(
      <AppProvider store={new InMemoryTeamStore()}>
        <Topbar />
      </AppProvider>,
    );

    expect(screen.getByRole("search")).toBeTruthy();
    expect(screen.getByLabelText(/search teams/i)).toBeTruthy();
  });

  it("hides the search form off the home route", () => {
    nav.pathname = "/teams/create";

    render(
      <AppProvider store={new InMemoryTeamStore()}>
        <Topbar />
      </AppProvider>,
    );

    expect(screen.getByRole("heading", { name: "Bloodbowl Teams" })).toBeTruthy();
    expect(screen.queryByLabelText(/search teams/i)).toBeNull();
    expect(screen.queryByRole("search")).toBeNull();
  });
});

describe("TeamList home heading CTA", () => {
  it("renders the Create New Team link to /teams/create in the heading row", async () => {
    renderWithStore();
    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    const cta = screen.getByRole("link", { name: /create new team/i });
    expect(cta).toBeTruthy();
    expect(cta.getAttribute("href")).toBe("/teams/create");
  });
});
