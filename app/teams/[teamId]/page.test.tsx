import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { AppProvider, useApp } from "@/app/providers/AppProvider";

// `use(params)` in TeamDetailPage suspends until the params promise resolves.
// Next.js wraps every page in a Suspense boundary; in tests we replicate it so the
// HydrationProbe (sibling, non-suspending) can still render and report hydration.
function renderWithSuspense(ui: React.ReactElement) {
  return <Suspense fallback={null}>{ui}</Suspense>;
}
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import type { TeamStore } from "@/features/teams/store/TeamStore";
import type { Team } from "@/features/teams/types";
import { DEFAULT_COACHING } from "@/features/teams/types";
import TeamDetailPage from "./page";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
}));

import { notFound } from "next/navigation";

const fixtureTeam: Team = {
  id: "team-abc",
  name: "Test Team",
  raceId: "human",
  leagueId: null,
  coaching: { ...DEFAULT_COACHING },
  roster: [],
};

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
    throw new Error("not needed");
  }

  remove(_id: string): Promise<void> {
    void _id;
    throw new Error("not needed");
  }
}

function HydrationProbe() {
  const { isHydrated } = useApp();
  return <span data-testid="hydration-status">{isHydrated ? "hydrated" : "loading"}</span>;
}

async function waitForHydration() {
  await waitFor(() => {
    expect(screen.getByTestId("hydration-status").textContent).toBe("hydrated");
  });
}

const assignedTeam: Team = { ...fixtureTeam, id: "team-league", leagueId: "league-1" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Team detail page", () => {
  it("passes the resolved league name to TeamDetailView when the team has a league", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ id: "league-1", name: "North Reikland League", description: null }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const store = new InMemoryTeamStore([assignedTeam]);
    await act(async () => {
      render(
        <AppProvider store={store}>
          <HydrationProbe />
          {renderWithSuspense(
            <TeamDetailPage params={Promise.resolve({ teamId: "team-league" })} />,
          )}
        </AppProvider>,
      );
    });

    await waitForHydration();
    await waitFor(() => {
      // The league badge resolves from /api/leagues/league-1 and is shown in the hero.
      expect(screen.getByText(/North Reikland League/)).toBeTruthy();
      expect(screen.queryByText(/Sin liga/)).toBeNull();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/leagues/league-1");
  });

  it("renders skeleton while store is hydrating", async () => {
    const store = new ControlledStore();
    await act(async () => {
      render(
        <AppProvider store={store}>
          {renderWithSuspense(
            <TeamDetailPage params={Promise.resolve({ teamId: "team-abc" })} />,
          )}
        </AppProvider>,
      );
    });

    expect(screen.getByTestId("team-detail-skeleton")).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("does not call notFound while store is hydrating", async () => {
    const store = new ControlledStore();
    await act(async () => {
      render(
        <AppProvider store={store}>
          {renderWithSuspense(
            <TeamDetailPage params={Promise.resolve({ teamId: "unknown-team" })} />,
          )}
        </AppProvider>,
      );
    });

    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getByTestId("team-detail-skeleton")).toBeTruthy();
  });

  it("renders TeamDetailView after hydration for a known team", async () => {
    const store = new InMemoryTeamStore([fixtureTeam]);
    await act(async () => {
      render(
        <AppProvider store={store}>
          <HydrationProbe />
          {renderWithSuspense(
            <TeamDetailPage params={Promise.resolve({ teamId: "team-abc" })} />,
          )}
        </AppProvider>,
      );
    });

    await waitForHydration();

    await waitFor(() => {
      expect(screen.getByText("Test Team")).toBeTruthy();
    });
  });

  it("calls notFound after hydration for an unknown teamId", async () => {
    const store = new InMemoryTeamStore([fixtureTeam]);
    await act(async () => {
      render(
        <AppProvider store={store}>
          <HydrationProbe />
          {renderWithSuspense(
            <TeamDetailPage params={Promise.resolve({ teamId: "does-not-exist" })} />,
          )}
        </AppProvider>,
      );
    });

    await waitForHydration();

    await waitFor(() => {
      expect(notFound).toHaveBeenCalled();
    });
  });
});

describe("Team detail page — owner progression wiring", () => {
  const ownedTeam: Team = { ...fixtureTeam, id: "team-prog", roster: [{ id: "pl1", name: "Marty", positionalKey: "blitzer" }] };

  it("fetches the owner team's progression rows and renders the Progresión panel with an onImprove client", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/teams/team-prog/progression") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              { rosterPlayerId: "pl1", pe: 6, skills: ["block"], injuries: [], valueBonus: 10000, alive: true, improvements: 1 },
            ]),
        });
      }
      if (url.startsWith("/api/leagues/")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ name: "L" }) });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const store = new InMemoryTeamStore([ownedTeam]);
    await act(async () => {
      render(
        <AppProvider store={store}>
          <HydrationProbe />
          {renderWithSuspense(
            <TeamDetailPage params={Promise.resolve({ teamId: "team-prog" })} />,
          )}
        </AppProvider>,
      );
    });

    await waitForHydration();
    await waitFor(() => expect(screen.getByText("Test Team")).toBeTruthy());
    // The owner's Player rows come back → the Progresión section renders with the
    // panel showing the PE balance. This asserts the page passes progression down.
    await waitFor(() => expect(screen.getByText("Progresión")).toBeTruthy());
    // The player appears in the roster AND the progression panel; the panel's PE
    // badge (`pe-pl1`) proves the progression row reached the panel.
    expect(screen.getAllByText("Marty").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("pe-pl1").textContent).toBe("6");
    expect(fetchMock).toHaveBeenCalledWith("/api/teams/team-prog/progression");
  });

  it("renders the roster read-only (no Progresión section) when the progression fetch fails", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/teams/team-prog/progression") {
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
      }
      if (url.startsWith("/api/leagues/")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ name: "L" }) });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const store = new InMemoryTeamStore([ownedTeam]);
    await act(async () => {
      render(
        <AppProvider store={store}>
          <HydrationProbe />
          {renderWithSuspense(
            <TeamDetailPage params={Promise.resolve({ teamId: "team-prog" })} />,
          )}
        </AppProvider>,
      );
    });

    await waitForHydration();
    await waitFor(() => expect(screen.getByText("Test Team")).toBeTruthy());
    // A failed progression fetch must not crash the page nor render the controls.
    await waitFor(() => expect(screen.getByText("Plantilla")).toBeTruthy());
    await expect(screen.findByText("Progresión")).rejects.toThrow();
  });
});

describe("Team detail page — rival scouting fallback", () => {

  const rivalTeam = {
    id: "rival-1",
    name: "Rival Orcboyz",
    raceId: "orc",
    leagueId: "foreign-league",
    coaching: { ...DEFAULT_COACHING },
    roster: [],
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches a rival team from the API when missing from the store and renders it read-only", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/teams/rival-1") {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rivalTeam) });
      }
      if (url.startsWith("/api/leagues/")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ name: "Foreign League" }) });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    // Empty store → the team is not local, so the page must scouting-fetch it.
    const store = new InMemoryTeamStore([]);
    await act(async () => {
      render(
        <AppProvider store={store}>
          <HydrationProbe />
          {renderWithSuspense(
            <TeamDetailPage params={Promise.resolve({ teamId: "rival-1" })} />,
          )}
        </AppProvider>,
      );
    });

    await waitForHydration();
    await waitFor(() => {
      expect(screen.getByText("Rival Orcboyz")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/teams/rival-1");
    // The foreign team renders via the read-only TeamDetailView (Plantilla section).
    expect(screen.getByText("Plantilla")).toBeTruthy();
  });

  it("calls notFound when scouting a missing/foreign team returns 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/teams/secret-team") {
          return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
        }
        if (url.startsWith("/api/leagues/")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ name: "L" }) });
        }
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
      }),
    );

    const store = new InMemoryTeamStore([fixtureTeam]);
    await act(async () => {
      render(
        <AppProvider store={store}>
          <HydrationProbe />
          {renderWithSuspense(
            <TeamDetailPage params={Promise.resolve({ teamId: "secret-team" })} />,
          )}
        </AppProvider>,
      );
    });

    await waitForHydration();
    await waitFor(() => {
      expect(notFound).toHaveBeenCalled();
    });
  });

  it("keeps rendering from the local store for an owned team (no scouting fetch)", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/leagues/")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ name: "L" }) });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const store = new InMemoryTeamStore([fixtureTeam]);
    await act(async () => {
      render(
        <AppProvider store={store}>
          <HydrationProbe />
          {renderWithSuspense(
            <TeamDetailPage params={Promise.resolve({ teamId: "team-abc" })} />,
          )}
        </AppProvider>,
      );
    });

    await waitForHydration();
    await waitFor(() => {
      expect(screen.getByText("Test Team")).toBeTruthy();
    });
    // No scouting fetch for an owned team present in the store.
    expect(fetchMock).not.toHaveBeenCalledWith("/api/teams/team-abc");
  });
});
