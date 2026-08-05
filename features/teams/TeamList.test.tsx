import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProvider } from "@/app/providers/AppProvider";
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import type { TeamStore } from "@/features/teams/store/TeamStore";
import { Topbar } from "@/components/Topbar";
import { TeamList } from "./TeamList";
import type { Team } from "./types";
import { DEFAULT_COACHING, DEFAULT_LEAGUE_TYPE } from "./types";

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
});
