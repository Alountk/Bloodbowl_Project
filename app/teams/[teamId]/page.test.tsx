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
