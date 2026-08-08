import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LeagueDetail } from "./LeagueDetail";

/**
 * LeagueDetail loads the league (with members) from /api/leagues/[id] and the
 * user's teams from /api/teams, then lets the owner assign/expel teams. The API
 * is session-scoped and returns 401 unauthenticated, so tests mock `fetch`.
 */

const leagueDetail = {
  id: "l1",
  name: "North Reikland",
  description: "Open league",
  ownerId: "u1",
  createdAt: "2026-01-01",
  teams: [
    { id: "t1", name: "Reikland Reavers", raceId: "human", leagueId: "l1", roster: [{}, {}], coaching: {} },
  ],
};

const availableTeams = [
  { id: "t2", name: "Middenheim Marauders", raceId: "human", leagueId: null, roster: [], coaching: {} },
  { id: "t3", name: "Already Assigned", raceId: "orc", leagueId: "other", roster: [], coaching: {} },
];

function stubFetch(detail = leagueDetail, teams = availableTeams) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/teams") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(teams) });
    }
    if (url === "/api/leagues/l1") {
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

describe("LeagueDetail", () => {
  it("renders the hero with the league name, description and member count", async () => {
    stubFetch();
    render(<LeagueDetail leagueId="l1" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "North Reikland" })).toBeTruthy());
    expect(screen.getByText("Open league")).toBeTruthy();
  });

  it("lists member rows with race name and players count, and an Expulsar button", async () => {
    stubFetch();
    render(<LeagueDetail leagueId="l1" />);

    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());

    const row = screen.getByText("Reikland Reavers").closest("li") as HTMLElement;
    // Meta line: race name · player count, rendered as one text node.
    expect(within(row).getByText(/Human · 2/)).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Expulsar" })).toBeTruthy();
  });

  it("shows only unassigned teams in the assign select (own teams without league)", async () => {
    stubFetch();
    render(<LeagueDetail leagueId="l1" />);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Equipos" })).toBeTruthy());

    const select = screen.getByRole("combobox", { name: "Equipos" });
    expect(within(select as HTMLElement).getByRole("option", { name: "Middenheim Marauders" })).toBeTruthy();
    // Assigned teams (leagueId set) are not offered.
    expect(within(select as HTMLElement).queryByRole("option", { name: "Already Assigned" })).toBeNull();
  });

  it("assigning a team POSTs to the league teams route and refreshes", async () => {
    const fetchMock = stubFetch();
    render(<LeagueDetail leagueId="l1" />);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Equipos" })).toBeTruthy());
    fireEvent.change(screen.getByRole("combobox", { name: "Equipos" }), {
      target: { value: "t2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/leagues/l1/teams", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ teamId: "t2" }),
      })),
    );
  });

  it("expelling a team DELETEs the member route and refreshes", async () => {
    const fetchMock = stubFetch();
    render(<LeagueDetail leagueId="l1" />);

    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Expulsar" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/leagues/l1/members/t1", expect.objectContaining({
        method: "DELETE",
      })),
    );
  });
});
