import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LeagueDetail } from "./LeagueDetail";

/**
 * The detail is role- and status-aware:
 * - OWNER of an open league → member list + expel + "Iniciar liga" (start modal).
 * - Non-owner MEMBER of an open league → "Desapuntarse" (self-leave).
 * - Non-owner non-member of an open league → "Unirse" (select own team + Apuntarse).
 * - STARTED league (owner or member) → jornadas (home vs away) + "Iniciada" badge, no controls.
 * - Foreign non-member of a STARTED league → 404 not-found (the API returns 404).
 *
 * useSession supplies the current user id (owner vs member vs foreign).
 */

const me = "u1";

const sessionMock = vi.hoisted(() =>
  vi.fn(() => ({ data: { user: { id: me } }, status: "authenticated" })),
);
vi.mock("next-auth/react", () => ({
  useSession: () => sessionMock(),
}));

const ownOpenLeague = {
  id: "l1",
  name: "My Public League",
  description: "Mi liga",
  ownerId: me,
  createdAt: "2026-01-01",
  status: "open",
  seasonLength: null,
  startedAt: null,
  ownerName: "Coach A",
  memberCount: 3,
  teams: [
    { id: "t1", name: "Reavers", raceId: "human", leagueId: "l1", userId: "u9", roster: [{}, {}] },
    { id: "t2", name: "Orcs", raceId: "orc", leagueId: "l1", userId: "u8", roster: [{}, {}] },
    { id: "t3", name: "Elves", raceId: "elf", leagueId: "l1", userId: "u7", roster: [{}, {}] },
  ],
  fixtures: [],
};

const foreignOpenLeague = {
  id: "l2",
  name: "Open Public Cup",
  description: "Para todos",
  ownerId: "u2",
  createdAt: "2026-01-01",
  status: "open",
  seasonLength: null,
  startedAt: null,
  ownerName: "Coach B",
  memberCount: 2,
  teams: [
    { id: "tA", name: "Goblins", raceId: "goblin", leagueId: "l2", userId: "u5", roster: [{}, {}] },
  ],
  fixtures: [],
};

const foreignOpenAsMember = {
  ...foreignOpenLeague,
  teams: [
    { id: "tA", name: "Goblins", raceId: "goblin", leagueId: "l2", userId: "u5", roster: [{}, {}] },
    { id: "tM", name: "My Troop", raceId: "human", leagueId: "l2", userId: me, roster: [{}, {}] },
  ],
};

const startedLeague = {
  id: "l3",
  name: "Started Cup",
  description: null,
  ownerId: "u2",
  createdAt: "2026-01-01",
  status: "started",
  seasonLength: 2,
  startedAt: "2026-02-01",
  ownerName: "Coach B",
  memberCount: 4,
  teams: [
    { id: "t1", name: "Reavers", raceId: "human", leagueId: "l3", userId: me, roster: [{}, {}] },
    { id: "t2", name: "Orcs", raceId: "orc", leagueId: "l3", userId: "u8", roster: [{}, {}] },
  ],
  fixtures: [
    { id: "f1", leagueId: "l3", round: 1, homeTeamId: "t1", awayTeamId: "t2", createdAt: "2026-02-01" },
    { id: "f2", leagueId: "l3", round: 2, homeTeamId: "t2", awayTeamId: "t1", createdAt: "2026-02-01" },
  ],
};

function makeFetch(detail: unknown, ownTeams: unknown[] = []) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/teams") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ownTeams) });
    }
    if (url === `/api/leagues/${(detail as { id: string }).id}`) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(detail) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LeagueDetail — owner of an open league (admin)", () => {
  it("shows the member list with an Expulsar action and an enabled Iniciar liga button", async () => {
    makeFetch(ownOpenLeague);
    render(<LeagueDetail leagueId="l1" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "My Public League" })).toBeTruthy());

    // Member rows with expel.
    expect(screen.getByText("Reavers")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Expulsar" })).toHaveLength(3);
    // Open + ≥2 members → start is enabled.
    const start = screen.getByRole("button", { name: "Iniciar liga" }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
  });

  it("disables Iniciar liga when the open league has fewer than 2 members", async () => {
    makeFetch({ ...ownOpenLeague, teams: [ownOpenLeague.teams[0]], memberCount: 1 });
    render(<LeagueDetail leagueId="l1" />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Iniciar liga" })).toBeTruthy());
    const start = screen.getByRole("button", { name: "Iniciar liga" }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
  });

  it("opens the start modal and refreshes into jornadas after a successful start", async () => {
    const fetchMock = makeFetch(ownOpenLeague);
    render(<LeagueDetail leagueId="l1" />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Iniciar liga" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Iniciar liga" }));

    // The rulebook start dialog opens with the jornadas input.
    await waitFor(() => expect(screen.getByLabelText(/jornadas/i)).toBeTruthy());
    const dialog = screen.getByRole("dialog", { name: "Iniciar liga" });
    fireEvent.change(within(dialog).getByLabelText(/jornadas/i), { target: { value: "2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Iniciar liga" }));

    // POST to the start route with the chosen season length.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/leagues/l1/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seasonLength: 2 }),
      }),
    );
  });
});

describe("LeagueDetail — non-owner member of an open league", () => {
  it("shows Desapuntarse (self-leave) against the user's own member team", async () => {
    const fetchMock = makeFetch(foreignOpenAsMember);
    render(<LeagueDetail leagueId="l2" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Open Public Cup" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Desapuntarse" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/leagues/l2/members/tM", {
        method: "DELETE",
      }),
    );
  });
});

describe("LeagueDetail — foreign non-member of an open league (public join)", () => {
  it("shows Unirse with the user's own eligible teams and an Apuntarse button", async () => {
    const fetchMock = makeFetch(foreignOpenLeague, [
      { id: "tFree", name: "Free Reavers", raceId: "human", leagueId: null },
    ]);
    render(<LeagueDetail leagueId="l2" />);

    await waitFor(() => expect(screen.getByText("Unirse")).toBeTruthy());

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(within(select).getByRole("option", { name: "Free Reavers" })).toBeTruthy();

    fireEvent.change(select, { target: { value: "tFree" } });
    fireEvent.click(screen.getByRole("button", { name: "Apuntarse" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/leagues/l2/teams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId: "tFree" }),
      }),
    );
  });

  it("shows a hint when the user has no eligible team to join with", async () => {
    makeFetch(foreignOpenLeague, []);
    render(<LeagueDetail leagueId="l2" />);

    await waitFor(() => expect(screen.getByText(/Crea un equipo para unirte/)).toBeTruthy());
  });
});

describe("LeagueDetail — STARTED league", () => {
  it("renders jornadas grouped by round as Home vs Away with the Iniciada badge", async () => {
    makeFetch(startedLeague);
    render(<LeagueDetail leagueId="l3" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Started Cup" })).toBeTruthy());

    expect(screen.getByText("Iniciada")).toBeTruthy();
    // Two rounds; each matchup renders its home and away teams.
    expect(screen.getByText("Jornada 1")).toBeTruthy();
    expect(screen.getByText("Jornada 2")).toBeTruthy();
    // Reavers (round 1 home / round 2 away) and Orcs (round 1 away) both appear.
    expect(screen.getAllByText("Reavers").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Orcs").length).toBeGreaterThan(0);
    // A matchup separator marks each home-vs-away pairing.
    expect(screen.getAllByText("vs")).toHaveLength(startedLeague.fixtures.length);

    // Round 1 pairs Reavers (home) vs Orcs (away) as independent slots.
    const round1 = screen.getByRole("region", { name: "Jornada 1" });
    expect(within(round1).getByText("Reavers")).toBeTruthy();
    expect(within(round1).getByText("Orcs")).toBeTruthy();

    // No join/leave/expel controls on a started league.
    expect(screen.queryByRole("button", { name: "Expulsar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Desapuntarse" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Unirse" })).toBeNull();
  });

  it("renders the not-found page for a foreign non-member started league (404)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) })),
    );
    render(<LeagueDetail leagueId="foreign" />);

    await waitFor(() =>
      expect(screen.getByText("Liga no encontrada o sin acceso.")).toBeTruthy(),
    );
  });
});
