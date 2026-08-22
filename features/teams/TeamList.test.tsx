import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AppProvider } from "@/app/providers/AppProvider";
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import { ArchiveGuardError } from "@/features/teams/store/ApiTeamStore";
import type { TeamStore } from "@/features/teams/store/TeamStore";
import { AppNav } from "@/components/AppNav";
import { TeamList } from "./TeamList";
import { TeamSearch } from "./TeamSearch";
import type { Team } from "./types";
import { DEFAULT_COACHING } from "./types";

vi.mock("@/features/leagues/api", () => ({
  getLeagueDetail: vi.fn(),
}));

import { getLeagueDetail } from "@/features/leagues/api";
const getLeagueDetailMock = getLeagueDetail as ReturnType<typeof vi.fn>;

// The shell renders a route-aware AppNav (search on the home route only).
// `usePathnameMock` is a mutable holder accessed through the vi.mock factory;
// each test sets the current route.
const nav = { pathname: "/" };

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
}));

// The Sidebar reads the session to gate the developer nav link (RAU-52);
// these shell tests render without a SessionProvider → no session.
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
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
    leagueId: null,
    treasury: 0,
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
    leagueId: null,
    treasury: 0,
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
      <AppNav authenticated={false} />
      <TeamSearch />
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
    await waitFor(() => expect(screen.getByRole("heading", { name: "Equipos" })).toBeTruthy());

    expect(screen.getByText("Reikland Reavers")).toBeTruthy();
    expect(screen.getByText("Human")).toBeTruthy();
    expect(screen.getByText("11 jugadores · 7x Human Lineman · 4x Human Blitzer")).toBeTruthy();
    expect(screen.getByText("Da Krumpaz")).toBeTruthy();
    expect(screen.getByText("Orc")).toBeTruthy();
    expect(screen.getByText("11 jugadores · 11x Orc Blitzer")).toBeTruthy();
  });

  it("shows an empty state when there are no teams", async () => {
    renderWithStore([]);
    await waitFor(() => expect(screen.getByText(/no hay equipos todavía/i)).toBeTruthy());
  });

  it("does not show the empty state until hydration completes", async () => {
    const store = new ControlledStore();
    render(
      <AppProvider store={store}>
        <TeamList />
      </AppProvider>,
    );

    expect(screen.queryByText(/no hay equipos todavía/i)).toBeNull();

    store.listCall.resolve([]);

    await waitFor(() => expect(screen.getByText(/no hay equipos todavía/i)).toBeTruthy());
  });

  it("filters by team name from the topbar", async () => {
    renderWithStoreAndTopbar();
    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/buscar equipos/i), {
      target: { value: "reikland" },
    });

    expect(screen.getByText("Reikland Reavers")).toBeTruthy();
    expect(screen.queryByText("Da Krumpaz")).toBeNull();
  });

  it("filters by race name from the topbar", async () => {
    renderWithStoreAndTopbar();
    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/buscar equipos/i), {
      target: { value: "orc" },
    });

    expect(screen.getByText("Da Krumpaz")).toBeTruthy();
    expect(screen.queryByText("Reikland Reavers")).toBeNull();
  });

  it("shows a no-matches message when the query matches nothing", async () => {
    renderWithStoreAndTopbar();
    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/buscar equipos/i), {
      target: { value: "nuffle" },
    });

    expect(screen.getByText(/ningún equipo coincide con tu búsqueda/i)).toBeTruthy();
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

    fireEvent.change(screen.getByLabelText(/buscar equipos/i), {
      target: { value: "reikland" },
    });

    expect(screen.getByRole("link", { name: /reikland reavers/i })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /da krumpaz/i })).toBeNull();
  });

  it("renders a delete button on each team card with an accessible label", async () => {
    renderWithStore();
    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    expect(screen.getByRole("button", { name: "Eliminar Reikland Reavers" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Eliminar Da Krumpaz" })).toBeTruthy();
  });

  it("opens the confirmation dialog when a delete button is activated without navigating", async () => {
    renderWithStore();
    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    const deleteBtn = screen.getByRole("button", { name: "Eliminar Reikland Reavers" });
    fireEvent.click(deleteBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(
      screen.getByText(
        "Esta acción no se puede deshacer. El equipo se archivará y se eliminará de tu lista.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeTruthy();
  });

  it("Cancelar closes the dialog and keeps the team in the list", async () => {
    renderWithStore();
    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Eliminar Reikland Reavers" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Reikland Reavers")).toBeTruthy();
  });

  it("Eliminar removes the team from the list after confirm", async () => {
    renderWithStore();
    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Eliminar Reikland Reavers" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(screen.queryByText("Reikland Reavers")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Da Krumpaz")).toBeTruthy();
  });
});

describe("TeamList — archive-guard (409) surface", () => {
  /** A member team: belongs to a league so DELETE is expected to 409. */
  const memberTeams: Team[] = [
    {
      id: "team-m1",
      name: "League Marauders",
      raceId: "human",
      coaching: { ...DEFAULT_COACHING },
      leagueId: "league-42",
      treasury: 0,
      roster: Array.from({ length: 11 }, (_, i) => ({
        id: `m${i}`,
        name: `Player ${i + 1}`,
        positionalKey: "lineman",
      })),
    },
    {
      id: "team-m2",
      name: "Orphan Orcs",
      raceId: "orc",
      coaching: { ...DEFAULT_COACHING },
      leagueId: null,
      treasury: 0,
      roster: Array.from({ length: 11 }, (_, i) => ({
        id: `o${i}`,
        name: `Player ${i + 1}`,
        positionalKey: "blitzer",
      })),
    },
  ];

  beforeEach(() => {
    getLeagueDetailMock.mockReset();
  });

  /** Store whose remove() rejects with ArchiveGuardError for league members. */
  class GuardedStore implements TeamStore {
    list(): Promise<Team[]> {
      return Promise.resolve([...memberTeams]);
    }
    save(_team: Team): Promise<Team> {
      void _team;
      throw new Error("not needed in this test");
    }
    remove(id: string): Promise<void> {
      const team = memberTeams.find((t) => t.id === id);
      if (team?.leagueId) {
        return Promise.reject(new ArchiveGuardError("This team still belongs to a league. Expel it first."));
      }
      return Promise.resolve();
    }
  }

  function renderGuarded() {
    render(
      <AppProvider store={new GuardedStore()}>
        <TeamList />
      </AppProvider>,
    );
  }

  it("shows the guard message and keeps the team when delete is blocked with a 409", async () => {
    getLeagueDetailMock.mockResolvedValue({
      id: "league-42",
      name: "Liga de Verano",
      description: null,
      ownerId: "u1",
      createdAt: new Date().toISOString(),
    });

    renderGuarded();
    await waitFor(() => expect(screen.getByText("League Marauders")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Eliminar League Marauders" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    // The guard message (with the resolved league name) appears in the dialog.
    await waitFor(() =>
      expect(
        screen.getByText(
          "No se puede borrar este equipo — pertenece a la liga Liga de Verano. Para poder borrarlo, primero expulsalo de la liga.",
        ),
      ).toBeTruthy(),
    );
    // A single acknowledgement button, not the destructive/confirm pair.
    expect(screen.getByRole("button", { name: "Entendido" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();

    // The team is NOT removed — the card (and dialog title) still render it.
    const teamLinks = screen.getAllByRole("link", { name: /league marauders/i });
    expect(teamLinks.length).toBeGreaterThanOrEqual(1);
    expect(getLeagueDetailMock).toHaveBeenCalledWith("league-42");

    // Entendido closes the dialog and the team stays in the list.
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getAllByRole("link", { name: /league marauders/i }).length).toBe(1);
  });

  it("falls back to the league id in the guard message when the league name cannot be resolved", async () => {
    getLeagueDetailMock.mockRejectedValue(new Error("network down"));

    renderGuarded();
    await waitFor(() => expect(screen.getByText("League Marauders")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Eliminar League Marauders" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "No se puede borrar este equipo — pertenece a la liga league-42. Para poder borrarlo, primero expulsalo de la liga.",
        ),
      ).toBeTruthy(),
    );
    // Still blocked: the team is not removed and Entendido is available.
    expect(screen.getByRole("button", { name: "Entendido" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /league marauders/i }).length).toBeGreaterThanOrEqual(1);
  });

  it("still removes an unassigned team normally when the API allows delete", async () => {
    renderGuarded();
    await waitFor(() => expect(screen.getByText("Orphan Orcs")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Eliminar Orphan Orcs" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    // Unassigned team delete succeeds and closes the dialog without a guard.
    await waitFor(() => expect(screen.queryByText("Orphan Orcs")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getLeagueDetailMock).not.toHaveBeenCalled();
  });
});

describe("AppNav unified navigation", () => {
  it("renders Teams, Leagues and Matches in the unified nav", () => {
    render(
      <AppProvider store={new InMemoryTeamStore()}>
        <AppNav authenticated={false} />
      </AppProvider>,
    );

    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getByRole("link", { name: "Leagues" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Teams" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Matches" })).toBeTruthy();
    expect(within(nav).getAllByRole("link")).toHaveLength(3);
  });
});

describe("TeamSearch placement", () => {
  it("renders the search form in the teams section (not the nav)", () => {
    render(
      <AppProvider store={new InMemoryTeamStore()}>
        <TeamSearch />
      </AppProvider>,
    );

    expect(screen.getByRole("search")).toBeTruthy();
    expect(screen.getByLabelText(/buscar equipos/i)).toBeTruthy();
  });

  it("the nav itself renders no search form", () => {
    render(
      <AppProvider store={new InMemoryTeamStore()}>
        <AppNav authenticated={false} />
      </AppProvider>,
    );

    expect(screen.queryByRole("search")).toBeNull();
    expect(screen.queryByLabelText(/buscar equipos/i)).toBeNull();
  });
});

describe("TeamList home heading CTA", () => {
  it("renders the Crear equipo link to /teams/create in the heading row", async () => {
    renderWithStore();
    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    const cta = screen.getByRole("link", { name: /crear equipo/i });
    expect(cta).toBeTruthy();
    expect(cta.getAttribute("href")).toBe("/teams/create");
  });

  it("wraps the heading row and keeps a ≥40px CTA tap target on mobile", async () => {
    renderWithStore();
    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    // The heading row wraps so the CTA falls below the h2 at narrow widths.
    const headingRow = screen.getByRole("heading", { name: "Equipos" }).parentElement;
    expect(headingRow?.className).toContain("flex-wrap");
    expect(headingRow?.className).toContain("items-center");

    // The CTA maintains a vertical tap target of at least 40px (py-2.5 = 10px top/bottom).
    const cta = screen.getByRole("link", { name: /crear equipo/i });
    expect(cta.className).toContain("py-2.5");
  });
});
