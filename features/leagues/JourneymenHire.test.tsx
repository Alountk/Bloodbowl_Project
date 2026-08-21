import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { JourneymenHirePanel } from "./JourneymenHire";
import type { LiveMatchView, MatchDetail } from "./api";

/**
 * RAU-14 post-resolve journeyman hire panel tests: after the match is reported,
 * each side's OWNER sees their fielded Novatos ("Tu novato {name} puede
 * quedarse por {cost}") with **Contratar** / **Dejar ir**. "Contratar" POSTs
 * `hireJourneyman { hire: true }`, "Dejar ir" POSTs `hire: false`, and every
 * decision refreshes via `onUpdated` (the panel disappears when no journeymen
 * remain). An admin/bye viewer renders nothing.
 */

function baseDetail(overrides: {
  viewerSide?: "home" | "away" | null;
  journeymen?: { home: { id: string; name: string }[]; away: { id: string; name: string }[] } | null;
} = {}): MatchDetail {
  const { viewerSide = "home", journeymen = { home: [{ id: "journeyman-th-1", name: "Aldric Martillo" }], away: [] } } = overrides;
  return {
    fixture: {
      id: "f1",
      leagueId: "l1",
      round: 1,
      homeTeamId: "th",
      awayTeamId: "ta",
      createdAt: "2026-02-01",
      scheduledAt: "2026-03-01T10:00:00.000Z",
      winnerId: null,
      homeScore: null,
      awayScore: null,
      status: "played",
      homeOwner: { id: "u1", name: "Coach A" },
      awayOwner: { id: "u2", name: "Coach B" },
      proposals: [],
    },
    result: {
      id: "mr-1",
      fixtureId: "f1",
      weather: null,
      scores: {
        home: { score: 2, casualties: [], pe: [] },
        away: { score: 1, casualties: [], pe: [] },
        winnerId: "th",
      },
      pettyCash: 0,
      loadedBy: "u1",
      createdAt: "2026-03-01T21:00:00.000Z",
    },
    homeTeam: {
      id: "th",
      name: "Reavers",
      raceId: "human",
      user: { id: "u1", name: "Coach A", email: "a@x", avatar: null },
      players: [],
    },
    awayTeam: {
      id: "ta",
      name: "Orcs",
      raceId: "orc",
      user: { id: "u2", name: "Coach B", email: "b@x", avatar: null },
      players: [],
    },
    live: {
      seq: 13,
      status: "finished",
      half: 2,
      turnNumber: 8,
      activeSide: "away",
      homeConsented: true,
      awayConsented: true,
      viewerSide,
      startedAt: 1000,
      elapsed: 3100,
      homeTurnMs: 1500,
      awayTurnMs: 1600,
      homeScore: 2,
      awayScore: 1,
      paused: false,
      finishedAt: 5000,
      concedeProposedBy: null,
      pendingCasualty: null,
      mvpNominations: { home: ["h1"], away: ["a1"] },
      journeymen,
      events: [],
    } as LiveMatchView,
    liveWinnings: { home: 55000, away: 45000 },
  };
}

afterEach(() => vi.unstubAllGlobals());

function renderPanel(props: Partial<Parameters<typeof JourneymenHirePanel>[0]> = {}) {
  const onUpdated = vi.fn().mockResolvedValue(undefined);
  render(
    <JourneymenHirePanel
      detail={baseDetail()}
      viewerSide="home"
      onUpdated={onUpdated}
      {...props}
    />,
  );
  return { onUpdated };
}

describe("JourneymenHirePanel", () => {
  it("renders the offer for the viewer's OWN side: journeyman name + the race Lineman cost (RAU-14)", () => {
    renderPanel();
    const section = screen.getByTestId("journeymen-hire");
    expect(within(section).getByText(/Aldric Martillo/)).toBeTruthy();
    // Human Lineman = 50.000 gp — "Tu novato Aldric Martillo puede quedarse por 50.000 M.O."
    expect(
      within(section).getByText("Tu novato Aldric Martillo puede quedarse por 50.000 M.O."),
    ).toBeTruthy();
    expect(within(section).getByRole("button", { name: "Contratar" })).toBeTruthy();
    expect(within(section).getByRole("button", { name: "Dejar ir" })).toBeTruthy();
  });

  it("renders one offer per remaining journeyman (per-novato choice)", () => {
    renderPanel({
      detail: baseDetail({
        viewerSide: "home",
        journeymen: {
          home: [
            { id: "journeyman-th-1", name: "Aldric Martillo" },
            { id: "journeyman-th-2", name: "Brunhild Hacha" },
          ],
          away: [],
        },
      }),
    });
    const section = screen.getByTestId("journeymen-hire");
    expect(within(section).getByText(/Aldric Martillo/)).toBeTruthy();
    expect(within(section).getByText(/Brunhild Hacha/)).toBeTruthy();
    expect(within(section).getAllByRole("button", { name: "Contratar" })).toHaveLength(2);
    expect(within(section).getAllByRole("button", { name: "Dejar ir" })).toHaveLength(2);
  });

  it("renders nothing for an admin/bye viewer (no side)", () => {
    renderPanel({ viewerSide: null });
    expect(screen.queryByTestId("journeymen-hire")).toBeNull();
  });

  it("renders nothing when the viewer's side has no remaining journeymen (all hired-or-gone)", () => {
    renderPanel({
      detail: baseDetail({ viewerSide: "home", journeymen: { home: [], away: [{ id: "j", name: "Rival" }] } }),
    });
    expect(screen.queryByTestId("journeymen-hire")).toBeNull();
  });

  it("renders nothing when `live.journeymen` is null (match never persisted any)", () => {
    renderPanel({ detail: baseDetail({ viewerSide: "home", journeymen: null }) });
    expect(screen.queryByTestId("journeymen-hire")).toBeNull();
  });

  it("'Contratar' POSTs hireJourneyman { hire: true } for the OWN side and refreshes (onUpdated)", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => {
      void _url;
      void _init;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            journeymen: { home: [], away: [] },
            team: { id: "th", roster: [{ id: "new-1", name: "Aldric Martillo", positionalKey: "lineman" }], treasury: 450000 },
          }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { onUpdated } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Contratar" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
    const call = fetchMock.mock.calls.find(([, init]) =>
      String((init as RequestInit).body).includes("hireJourneyman"),
    );
    expect(call).toBeTruthy();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toEqual({ type: "hireJourneyman", side: "home", journeymanId: "journeyman-th-1", hire: true });
  });

  it("'Dejar ir' POSTs hireJourneyman { hire: false } and refreshes (no roster change)", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => {
      void _url;
      void _init;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            journeymen: { home: [], away: [] },
            team: { id: "th", roster: [], treasury: 0 },
          }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { onUpdated } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Dejar ir" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
    const call = fetchMock.mock.calls.find(([, init]) =>
      String((init as RequestInit).body).includes("hireJourneyman"),
    );
    expect(call).toBeTruthy();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toEqual({ type: "hireJourneyman", side: "home", journeymanId: "journeyman-th-1", hire: false });
  });

  it("surfaces a rejection (e.g. 409 insufficient balance) in the panel and does NOT refresh", async () => {
    vi.stubGlobal("fetch", (_url: string, _init?: RequestInit) => {
      void _url;
      void _init;
      return Promise.resolve({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: "Cannot hire in current state" }),
      });
    });

    const { onUpdated } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Contratar" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Cannot hire in current state"),
    );
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
