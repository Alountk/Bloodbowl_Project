import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LeagueList } from "./LeagueList";

/**
 * The list is public: `/api/leagues` returns the session user's own leagues
 * (any status) plus every OPEN league from any user, each with a server-side
 * `memberCount`, `ownerName` and an `isMember` flag (the user holds a
 * non-archived member team). `useSession` supplies the current user id so the
 * list can partition cards into "Mis Ligas" (owned OR joined — including
 * started leagues) and "Ligas abiertas" (foreign open leagues the user can join).
 */

const me = "u1";

const sessionMock = vi.hoisted(() =>
  vi.fn(() => ({ data: { user: { id: me } }, status: "authenticated" })),
);
vi.mock("next-auth/react", () => ({
  useSession: () => sessionMock(),
}));

const leaguesResponse = [
  // My own open league → belongs to "Mis Ligas".
  {
    id: "l1",
    name: "North Reikland",
    description: "Mi liga",
    ownerId: me,
    createdAt: "2026-01-01",
    status: "open",
    seasonLength: null,
    startedAt: null,
    ownerName: "Coach A",
    memberCount: 3,
    isMember: false,
  },
  // My own started league → "Mis Ligas" with the "Iniciada" badge.
  {
    id: "l2",
    name: "Middenheim Cup",
    description: null,
    ownerId: me,
    createdAt: "2026-02-01",
    status: "started",
    seasonLength: 2,
    startedAt: "2026-02-02",
    ownerName: "Coach A",
    memberCount: 2,
    isMember: false,
  },
  // A foreign OPEN league → "Ligas abiertas".
  {
    id: "l3",
    name: "Open Public Cup",
    description: "Para todos",
    ownerId: "u2",
    createdAt: "2026-03-01",
    status: "open",
    seasonLength: null,
    startedAt: null,
    ownerName: "Coach B",
    memberCount: 5,
    isMember: false,
  },
  // A STARTED league where I play (member, not owner) → "Mis Ligas".
  {
    id: "l4",
    name: "Joined Started Cup",
    description: null,
    ownerId: "u2",
    createdAt: "2026-04-01",
    status: "started",
    seasonLength: 1,
    startedAt: "2026-04-02",
    ownerName: "Coach B",
    memberCount: 2,
    isMember: true,
  },
  // An OPEN league where I am a member → "Mis Ligas" ONLY, never "Ligas abiertas".
  {
    id: "l5",
    name: "Open Member Cup",
    description: null,
    ownerId: "u2",
    createdAt: "2026-05-01",
    status: "open",
    seasonLength: null,
    startedAt: null,
    ownerName: "Coach B",
    memberCount: 4,
    isMember: true,
  },
  // My FINISHED league (RAU-40) → "Mis Ligas" with the gold 🏆 Finalizada badge.
  {
    id: "l6",
    name: "Finished Cup",
    description: null,
    ownerId: me,
    createdAt: "2026-06-01",
    status: "finished",
    seasonLength: 1,
    startedAt: "2026-06-02",
    championTeamId: "t1",
    ownerName: "Coach A",
    memberCount: 2,
    isMember: false,
  },
];

function stubFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/leagues") {
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

describe("LeagueList", () => {
  it("renders the hero and both sections (Mis Ligas + Ligas abiertas)", async () => {
    stubFetch();
    render(<LeagueList />);

    await waitFor(() => expect(screen.getByText("North Reikland")).toBeTruthy());

    expect(screen.getByRole("heading", { level: 1, name: "Mis Ligas" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Mis Ligas" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Ligas abiertas" })).toBeTruthy();
  });

  it("partitions own leagues under Mis Ligas and foreign open under Ligas abiertas", async () => {
    stubFetch();
    render(<LeagueList />);

    await waitFor(() => expect(screen.getByText("North Reikland")).toBeTruthy());

    const ownSection = screen.getByRole("heading", { level: 2, name: "Mis Ligas" }).closest("section") as HTMLElement;
    const openSection = screen.getByRole("heading", { level: 2, name: "Ligas abiertas" }).closest("section") as HTMLElement;

    // Own open + own started are under Mis Ligas.
    expect(within(ownSection).getByText("North Reikland")).toBeTruthy();
    expect(within(ownSection).getByText("Middenheim Cup")).toBeTruthy();
    expect(within(ownSection).queryByText("Open Public Cup")).toBeNull();

    // The foreign open league is under Ligas abiertas only.
    expect(within(openSection).getByText("Open Public Cup")).toBeTruthy();
    expect(within(openSection).queryByText("North Reikland")).toBeNull();
  });

  it("partitions a STARTED member league under Mis Ligas so the user can open it", async () => {
    stubFetch();
    render(<LeagueList />);

    await waitFor(() => expect(screen.getByText("Joined Started Cup")).toBeTruthy());
    const ownSection = screen.getByRole("heading", { level: 2, name: "Mis Ligas" }).closest("section") as HTMLElement;
    const openSection = screen.getByRole("heading", { level: 2, name: "Ligas abiertas" }).closest("section") as HTMLElement;

    // A league where I play (but don't own) belongs to Mis Ligas — otherwise a
    // member of a started league could never navigate back to accept the VS.
    expect(within(ownSection).getByText("Joined Started Cup")).toBeTruthy();
    const joinedCard = screen.getByText("Joined Started Cup").closest("li") as HTMLElement;
    expect(within(joinedCard).getByText("Iniciada")).toBeTruthy();
    expect(within(openSection).queryByText("Joined Started Cup")).toBeNull();
  });

  it("keeps an OPEN league the user is a member of out of Ligas abiertas (Mis Ligas only)", async () => {
    stubFetch();
    render(<LeagueList />);

    await waitFor(() => expect(screen.getByText("Open Member Cup")).toBeTruthy());

    const ownSection = screen.getByRole("heading", { level: 2, name: "Mis Ligas" }).closest("section") as HTMLElement;
    const openSection = screen.getByRole("heading", { level: 2, name: "Ligas abiertas" }).closest("section") as HTMLElement;

    expect(within(ownSection).getByText("Open Member Cup")).toBeTruthy();
    expect(within(openSection).queryByText("Open Member Cup")).toBeNull();
    // Non-member open leagues still appear under Ligas abiertas.
    expect(within(openSection).getByText("Open Public Cup")).toBeTruthy();
  });

  it("shows the open/started status badge, owner name and server member count on cards", async () => {
    stubFetch();
    render(<LeagueList />);

    await waitFor(() => expect(screen.getByText("Open Public Cup")).toBeTruthy());

    const openCard = screen.getByText("Open Public Cup").closest("li") as HTMLElement;
    expect(within(openCard).getByText("Abierta")).toBeTruthy();
    expect(within(openCard).getByText("Coach B")).toBeTruthy();
    // memberCount comes from the server query, not a per-card detail fetch.
    expect(within(openCard).getByText("5 equipos")).toBeTruthy();
    expect(within(openCard).getByRole("link", { name: "Ver" }).getAttribute("href")).toBe("/leagues/l3");

    const startedCard = screen.getByText("Middenheim Cup").closest("li") as HTMLElement;
    expect(within(startedCard).getByText("Iniciada")).toBeTruthy();
    expect(within(startedCard).getByText("2 equipos")).toBeTruthy();
  });

  it("shows the gold 🏆 Finalizada badge on a finished league card (RAU-40)", async () => {
    stubFetch();
    render(<LeagueList />);

    await waitFor(() => expect(screen.getByText("Finished Cup")).toBeTruthy());

    const finishedCard = screen.getByText("Finished Cup").closest("li") as HTMLElement;
    expect(within(finishedCard).getByText(/Finalizada/)).toBeTruthy();
    expect(within(finishedCard).getByRole("link", { name: "Ver" }).getAttribute("href")).toBe("/leagues/l6");
  });

  it("no longer fetches per-league details for member counts (no N+1)", async () => {
    const fetchMock = stubFetch();
    render(<LeagueList />);

    await waitFor(() => expect(screen.getByText("North Reikland")).toBeTruthy());

    const leagueListCalls = fetchMock.mock.calls.map((call) => String(call[0]));
    // Every request hits /api/leagues (the single list); no /api/leagues/:id detail fetches.
    expect(leagueListCalls.every((url) => url === "/api/leagues")).toBe(true);
  });

  it("shows the empty state CTA when there are no leagues at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })),
    );
    render(<LeagueList />);

    await waitFor(() => expect(screen.getByText("No hay ligas todavía. Crea la primera.")).toBeTruthy());
    expect(screen.getAllByRole("button", { name: "+ Nueva liga" })).toHaveLength(2);
  });

  it("opens the create modal from the + Nueva liga button", async () => {
    stubFetch();
    render(<LeagueList />);

    fireEvent.click(screen.getByRole("button", { name: "+ Nueva liga" }));

    await waitFor(() => expect(screen.getByRole("dialog", { name: /Nueva liga/ })).toBeTruthy());
    expect(screen.getByLabelText("Nombre")).toBeTruthy();
    expect(screen.getByLabelText("Descripción")).toBeTruthy();
  });
});
