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
  rounds: [
    {
      round: 1,
      fixtures: ["f1"],
      complete: false,
    },
    {
      round: 2,
      fixtures: ["f2"],
      complete: true,
    },
  ],
  fixtures: [
    {
      id: "f1",
      leagueId: "l3",
      round: 1,
      homeTeamId: "t1",
      awayTeamId: "t2",
      createdAt: "2026-02-01",
      scheduledAt: null,
      winnerId: null,
      status: "pending",
      homeOwner: { id: me, name: "Coach Me" },
      awayOwner: { id: "u8", name: "Coach B" },
      proposals: [],
    },
    {
      id: "f2",
      leagueId: "l3",
      round: 2,
      homeTeamId: "t2",
      awayTeamId: "t1",
      createdAt: "2026-02-01",
      scheduledAt: "2026-03-01",
      winnerId: "t1",
      status: "played",
      homeOwner: { id: "u8", name: "Coach B" },
      awayOwner: { id: me, name: "Coach Me" },
      proposals: [],
    },
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
    // Fixture mutation routes (propose/accept/forfeit) succeed so the refresh
    // chain that follows the action resolves cleanly.
    if (/\/api\/leagues\/.+\/fixtures\/.+\/(propose|accept|forfeit)$/.test(url)) {
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
  it("renders round tabs with the first round selected and its match card", async () => {
    makeFetch(startedLeague);
    render(<LeagueDetail leagueId="l3" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Started Cup" })).toBeTruthy());

    expect(screen.getByText("Iniciada")).toBeTruthy();
    // Round tabs for every jornada; the first (round 1) is selected by default.
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(screen.getByRole("tab", { name: "Jornada 1" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Jornada 2" }).getAttribute("aria-selected")).toBe("false");

    // The active round renders as a region labelled "Jornada 1".
    const round1 = screen.getByRole("region", { name: "Jornada 1" });
    // Its single match card centers a VS between the two teams.
    expect(within(round1).getByText("VS")).toBeTruthy();
    expect(within(round1).getByText("Reavers")).toBeTruthy();
    expect(within(round1).getByText("Orcs")).toBeTruthy();

    // No join/leave/expel controls on a started league.
    expect(screen.queryByRole("button", { name: "Expulsar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Desapuntarse" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Unirse" })).toBeNull();
  });

  it("switches rounds via the tabs and shows the completion badge on a complete round", async () => {
    makeFetch(startedLeague);
    render(<LeagueDetail leagueId="l3" />);

    await waitFor(() => expect(screen.getByRole("tab", { name: "Jornada 2" })).toBeTruthy());

    // Round 1 has a pending fixture → no completion badge.
    expect(screen.queryByText("Jornada completa")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Jornada 2" }));
    expect(screen.getByRole("tab", { name: "Jornada 2" }).getAttribute("aria-selected")).toBe("true");
    // Round 2 is complete (its only fixture is played) → badge shows.
    expect(screen.getByText("Jornada completa")).toBeTruthy();
    // The played fixture shows a Jugado header (and footer).
    const jugado = within(screen.getByRole("region", { name: "Jornada 2" })).getAllByText(/Jugado/);
    expect(jugado.length).toBeGreaterThanOrEqual(1);
  });

  it("links a match card team to its scouting page /teams/[id]", async () => {
    makeFetch(startedLeague);
    render(<LeagueDetail leagueId="l3" />);

    await waitFor(() => expect(screen.getByRole("region", { name: "Jornada 1" })).toBeTruthy());
    const round1 = screen.getByRole("region", { name: "Jornada 1" });
    expect(within(round1).getByRole("link", { name: /Reavers/ }).getAttribute("href")).toBe("/teams/t1");
    expect(within(round1).getByRole("link", { name: /Orcs/ }).getAttribute("href")).toBe("/teams/t2");
  });

  it("opens the participant negotiation panel when a participant clicks a card", async () => {
    makeFetch(startedLeague);
    render(<LeagueDetail leagueId="l3" />);

    await waitFor(() => expect(screen.getByRole("region", { name: "Jornada 1" })).toBeTruthy());
    fireEvent.click(within(screen.getByRole("region", { name: "Jornada 1" })).getByText("VS"));

    // The participant (me owns t1, home of f1) gets propose controls.
    expect(screen.getByRole("dialog", { name: /Acordar fecha/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Proponer" })).toBeTruthy();
    expect(screen.getByLabelText(/Fecha propuesta/)).toBeTruthy();
  });

  it("lets the admin open the forfeit modal and award a winner", async () => {
    const adminStarted = {
      ...startedLeague,
      ownerId: me,
      ownerName: "Coach Me",
      teams: [
        { id: "t1", name: "Reavers", raceId: "human", leagueId: "l3", userId: "u8", roster: [{}, {}] },
        { id: "t2", name: "Orcs", raceId: "orc", leagueId: "l3", userId: "u9", roster: [{}, {}] },
      ],
      rounds: [{ round: 1, fixtures: ["f1"], complete: false }],
      fixtures: [
        {
          ...startedLeague.fixtures[0],
          homeOwner: { id: "u8", name: "Coach B" },
          awayOwner: { id: "u9", name: "Coach C" },
        },
      ],
    };
    const fetchMock = makeFetch(adminStarted);
    render(<LeagueDetail leagueId="l3" />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Otorgar victoria" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Otorgar victoria" }));

    expect(screen.getByRole("dialog", { name: /Otorgar victoria/ })).toBeTruthy();
    // Admin picks the home team and confirms → the forfeit POST fires.
    fireEvent.click(screen.getByRole("button", { name: /^Reavers$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Otorgar victoria a Reavers" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/leagues/l3/fixtures/f1/forfeit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ winnerTeamId: "t1" }),
      });
    });
  });

  it("lets a participant open the ResultModal on a scheduled fixture and submit the result", async () => {
    // me owns t1 (home) of a scheduled fixture → the Cargar resultado affordance.
    const scheduledStarted = {
      ...startedLeague,
      ownerId: "u2",
      ownerName: "Coach B",
      teams: [
        { id: "t1", name: "Reavers", raceId: "human", leagueId: "l3", userId: me, roster: [{ id: "h1", name: "Hugo" }] },
        { id: "t2", name: "Orcs", raceId: "orc", leagueId: "l3", userId: "u8", roster: [{ id: "a1", name: "Ansel" }] },
      ],
      rounds: [{ round: 1, fixtures: ["fs"], complete: false }],
      fixtures: [
        {
          id: "fs",
          leagueId: "l3",
          round: 1,
          homeTeamId: "t1",
          awayTeamId: "t2",
          createdAt: "2026-02-01",
          scheduledAt: "2026-03-01T10:00:00.000Z",
          winnerId: null,
          status: "scheduled",
          homeOwner: { id: me, name: "Coach Me" },
          awayOwner: { id: "u8", name: "Coach B" },
          proposals: [],
        },
      ],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/teams") {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
      }
      if (url === "/api/leagues/l3") {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(scheduledStarted) });
      }
      if (/\/api\/leagues\/l3\/fixtures\/fs\/result$/.test(url)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ fixtureId: "fs", status: "played", homeScore: 1, awayScore: 0, winnerId: "t1" }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LeagueDetail leagueId="l3" />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Cargar resultado" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Cargar resultado" }));

    const dialog = screen.getByRole("dialog", { name: /Cargar resultado/ });
    // Score 1 for Reavers, Hugo scores 1 TD → match. Score 0 for Orcs.
    fireEvent.change(within(dialog).getByLabelText(/Goles Reavers/), { target: { value: "1" } });
    fireEvent.change(within(dialog).getByLabelText(/Anotaciones Hugo/), { target: { value: "1" } });
    fireEvent.change(within(dialog).getByLabelText(/Goles Orcs/), { target: { value: "0" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar resultado" }));

    // POSTs the assembled payload to the result route (then refreshes).
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/fixtures/fs/result"));
      expect(call).toBeTruthy();
      expect((call as unknown[])[1]).toMatchObject({
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const body = JSON.parse(
        ((call as unknown as { 1: { body: string } })[1] as { body: string }).body,
      ) as ResultPayloadTestShape;
      expect(body.home.score).toBe(1);
      expect(body.home.players[0].tds).toBe(1);
    });
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

interface ResultPayloadTestShape {
  home: { score: number; players: { tds: number }[] };
}
