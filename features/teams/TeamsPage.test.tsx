import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProvider } from "@/app/providers/AppProvider";
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import { ArchiveGuardError } from "@/features/teams/store/ApiTeamStore";
import type { TeamStore } from "@/features/teams/store/TeamStore";
import { TeamsPage } from "./TeamsPage";
import type { Team } from "./types";
import { DEFAULT_COACHING } from "./types";

// The page's league map comes from a single listLeagues fetch; the cards fetch
// their own progression. Both are stubbed here.
vi.mock("./api", () => ({
  fetchTeamProgression: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/features/leagues/api", () => ({
  listLeagues: vi.fn(),
}));

import { listLeagues } from "@/features/leagues/api";
const listLeaguesMock = listLeagues as ReturnType<typeof vi.fn>;

const unassigned: Team = {
  id: "team-1",
  name: "Reikland Reavers",
  raceId: "human",
  coaching: { ...DEFAULT_COACHING },
  leagueId: null,
  treasury: 0,
  roster: [
    { id: "p1", name: "Player 1", positionalKey: "lineman" },
    { id: "p2", name: "Player 2", positionalKey: "lineman" },
    { id: "p3", name: "Player 3", positionalKey: "lineman" },
  ],
};

const assigned: Team = {
  id: "team-2",
  name: "Da Krumpaz",
  raceId: "orc",
  coaching: { ...DEFAULT_COACHING },
  leagueId: "league-42",
  treasury: 0,
  roster: Array.from({ length: 3 }, (_, i) => ({
    id: `o${i}`,
    name: `Player ${i + 1}`,
    positionalKey: "blitzer",
  })),
};

function league(id: string, name: string) {
  return {
    id,
    name,
    description: null,
    ownerId: "u1",
    createdAt: new Date().toISOString(),
    status: "open" as const,
    seasonLength: null,
    startedAt: null,
    championTeamId: null,
    ownerName: "Coach",
    memberCount: 1,
    isMember: false,
    turnClockEnabled: false,
    turnClockSeconds: 120 as const,
    rulesetId: null,
    rulesetName: null,
  };
}

beforeEach(() => {
  listLeaguesMock.mockReset();
});

function renderPageWith(teams: Team[]) {
  render(
    <AppProvider store={new InMemoryTeamStore(teams)}>
      <TeamsPage />
    </AppProvider>,
  );
}

describe("TeamsPage", () => {
  it("splits teams into 'Sin liga' and 'En liga' sections", async () => {
    listLeaguesMock.mockResolvedValue([league("league-42", "Liga de Verano")]);
    renderPageWith([unassigned, assigned]);

    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    expect(screen.getByRole("heading", { name: "Sin liga" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "En liga" })).toBeTruthy();
    // The assigned team carries its resolved league badge.
    await waitFor(() => expect(screen.getByText("Liga de Verano")).toBeTruthy());
  });

  it("hides a section when it has no teams", async () => {
    listLeaguesMock.mockResolvedValue([]);
    renderPageWith([unassigned]);

    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    expect(screen.getByRole("heading", { name: "Sin liga" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "En liga" })).toBeNull();
  });

  it("shows the empty state and create CTA when there are no teams", async () => {
    listLeaguesMock.mockResolvedValue([]);
    renderPageWith([]);

    await waitFor(() => expect(screen.getByText(/no hay equipos todavía/i)).toBeTruthy());
    const cta = screen.getByRole("link", { name: /crear equipo/i });
    expect(cta.getAttribute("href")).toBe("/teams/create");
  });

  it("does not show the empty state until hydration completes", async () => {
    listLeaguesMock.mockResolvedValue([]);
    class DeferredStore implements TeamStore {
      readonly pending = new Promise<Team[]>(() => {});
      list(): Promise<Team[]> {
        return this.pending;
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
    render(
      <AppProvider store={new DeferredStore()}>
        <TeamsPage />
      </AppProvider>,
    );

    expect(screen.queryByText(/no hay equipos todavía/i)).toBeNull();
  });

  it("filters BOTH sections by the search query", async () => {
    listLeaguesMock.mockResolvedValue([]);
    // One unassigned (Reavers) + two assigned; search matches across sections.
    const otherAssigned: Team = {
      id: "team-3",
      name: "Zon Longbottom",
      raceId: "dwarf",
      coaching: { ...DEFAULT_COACHING },
      leagueId: "league-42",
      treasury: 0,
      roster: [
        { id: "d1", name: "D1", positionalKey: "blitzer" },
        { id: "d2", name: "D2", positionalKey: "blitzer" },
      ],
    };
    renderPageWith([unassigned, assigned, otherAssigned]);

    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/buscar equipos/i), {
      target: { value: "krumpaz" },
    });

    expect(screen.getByText("Da Krumpaz")).toBeTruthy();
    expect(screen.queryByText("Reikland Reavers")).toBeNull();
    expect(screen.queryByText("Zon Longbottom")).toBeNull();
  });
});

describe("TeamsPage — delete flow", () => {
  it("removes a team from both sections after confirming delete", async () => {
    listLeaguesMock.mockResolvedValue([]);
    renderPageWith([unassigned, assigned]);

    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Eliminar Reikland Reavers" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(screen.queryByText("Reikland Reavers")).toBeNull());
    expect(screen.getByText("Da Krumpaz")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("surfaces the 409 guard with the league name from the map (no extra fetch)", async () => {
    listLeaguesMock.mockResolvedValue([league("league-42", "Liga de Verano")]);

    const guardTeams: Team[] = [assigned];
    class GuardedStore implements TeamStore {
      list(): Promise<Team[]> {
        return Promise.resolve([...guardTeams]);
      }
      save(_team: Team): Promise<Team> {
        void _team;
        throw new Error("not needed");
      }
      remove(id: string): Promise<void> {
        const team = guardTeams.find((t) => t.id === id);
        if (team?.leagueId) {
          return Promise.reject(new ArchiveGuardError("expel first"));
        }
        return Promise.resolve();
      }
    }
    render(
      <AppProvider store={new GuardedStore()}>
        <TeamsPage />
      </AppProvider>,
    );

    await waitFor(() => expect(screen.getByText("Da Krumpaz")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Eliminar Da Krumpaz" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "No se puede borrar este equipo — pertenece a la liga Liga de Verano. Para poder borrarlo, primero expulsalo de la liga.",
        ),
      ).toBeTruthy(),
    );
    // The guard resolved from the league map — NO per-team detail fetch.
    // Only the single listLeagues call happened.
    expect(listLeaguesMock).toHaveBeenCalledTimes(1);
    // A single acknowledgement button.
    expect(screen.getByRole("button", { name: "Entendido" })).toBeTruthy();
    // The team is NOT removed — it appears as a card and in the modal title.
    expect(screen.getAllByText("Da Krumpaz").length).toBeGreaterThanOrEqual(1);
  });

  it("falls back to the league id in the guard when the map is unavailable", async () => {
    listLeaguesMock.mockRejectedValue(new Error("network down"));

    const guardTeams: Team[] = [assigned];
    class GuardedStore implements TeamStore {
      list(): Promise<Team[]> {
        return Promise.resolve([...guardTeams]);
      }
      save(_team: Team): Promise<Team> {
        void _team;
        throw new Error("not needed");
      }
      remove(id: string): Promise<void> {
        const team = guardTeams.find((t) => t.id === id);
        if (team?.leagueId) {
          return Promise.reject(new ArchiveGuardError("expel first"));
        }
        return Promise.resolve();
      }
    }
    render(
      <AppProvider store={new GuardedStore()}>
        <TeamsPage />
      </AppProvider>,
    );

    await waitFor(() => expect(screen.getByText("Da Krumpaz")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Eliminar Da Krumpaz" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "No se puede borrar este equipo — pertenece a la liga league-42. Para poder borrarlo, primero expulsalo de la liga.",
        ),
      ).toBeTruthy(),
    );
  });
});
