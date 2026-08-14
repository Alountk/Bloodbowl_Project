import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { useSession } from "next-auth/react";
import { MatchView, teamTurnCounts } from "./MatchView";
import type { LiveMatchView, LiveMatchViewState, MatchDetail } from "./api";

// `MatchView` uses the session to derive the viewer's side when no live row
// exists (D19). Default the viewer to the home coach (u1).
vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({ data: { user: { id: "u1" } } })),
}));

/** Fake EventSource so MatchView's `useLiveMatch` (LiveActiveMatch) can connect. */
class FakeEventSource {
  url: string;
  onopen: (() => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  close = vi.fn();
  listeners: Record<string, (ev: { data: string; lastEventId: string }) => void> = {};
  constructor(url: string) {
    this.url = url;
  }
  addEventListener = vi.fn((type: string, fn: (ev: { data: string; lastEventId: string }) => void) => {
    this.listeners[type] = fn;
  });
  removeEventListener = vi.fn();
  dispatch(type: string, data: string) {
    this.listeners[type]?.({ data, lastEventId: "" } as unknown as MessageEvent);
  }
}

const liveInstances: FakeEventSource[] = [];

function stubLiveEventSource() {
  liveInstances.length = 0;
  vi.stubGlobal(
    "EventSource",
    class extends FakeEventSource {
      constructor(url: string) {
        super(url);
        liveInstances.push(this);
      }
    },
  );
}

/**
 * MatchView behavioral tests (MV-2/MV-3/MV-5/MV-6/MV-7). The client fetch is
 * exercised through the real getMatchDetail → readJson wiring by stubbing
 * global fetch (repo convention: LeagueDetail/MatchCard stub global fetch).
 */

afterEach(() => {
  vi.unstubAllGlobals();
  // Restore the default home-coach viewer (u1) — a test-local `mockReturnValue`
  // for u2 (away coach) would otherwise leak into subsequent tests.
  vi.mocked(useSession).mockReturnValue({ data: { user: { id: "u1" } } } as never);
});

function playedDetail(): MatchDetail {
  return {
    fixture: {
      id: "f1",
      leagueId: "l1",
      round: 1,
      homeTeamId: "t1",
      awayTeamId: "t2",
      createdAt: "2026-02-01",
      scheduledAt: "2026-03-01T20:00:00",
      winnerId: "t1",
      homeScore: 2,
      awayScore: 1,
      status: "played",
      homeOwner: { id: "u1", name: "Coach A" },
      awayOwner: { id: "u2", name: "Coach B" },
      proposals: [],
    },
    result: {
      id: "mr1",
      fixtureId: "f1",
      weather: "heat",
      scores: {
        home: {
          score: 2,
          postFf: 4,
          winnings: 45_000,
          casualties: [{ team: "home", rosterPlayerId: "p1", outcome: { kind: "grave" } }],
          pe: [
            { rosterPlayerId: "p1", pe: 7 },
            { rosterPlayerId: "p2", pe: 3 },
          ],
        },
        away: {
          score: 1,
          postFf: 2,
          winnings: 35_000,
          casualties: [{ team: "away", rosterPlayerId: "p3", outcome: { kind: "dead" } }],
          pe: [{ rosterPlayerId: "p3", pe: 3 }],
        },
        winnerId: "t1",
        mvp: { home: "p1", away: "p3" },
      },
      pettyCash: 150_000,
      loadedBy: "u1",
    },
    homeTeam: {
      id: "t1",
      name: "Reavers",
      raceId: "human",
      user: { id: "u1", name: "Coach A", email: "a@x", avatar: null },
      players: [
        { rosterPlayerId: "p1", name: "Blitzer A", positionalKey: "blitzer", pe: 7, skills: [], injuries: [], alive: true, valueBonus: 0 },
        { rosterPlayerId: "p2", name: "Thrower A", positionalKey: "thrower", pe: 3, skills: [], injuries: [], alive: true, valueBonus: 0 },
      ],
    },
    awayTeam: {
      id: "t2",
      name: "Dwarves",
      raceId: "dwarf",
      user: { id: "u2", name: "Coach B", email: "b@x", avatar: null },
      players: [
        { rosterPlayerId: "p3", name: "Blitzer B", positionalKey: "blitzer", pe: 3, skills: [], injuries: [], alive: true, valueBonus: 0 },
      ],
    },
    live: null,
  };
}

function scheduledDetail(): MatchDetail {
  const base = playedDetail();
  base.fixture.status = "scheduled";
  base.fixture.homeScore = null;
  base.fixture.awayScore = null;
  base.fixture.winnerId = null;
  base.result = null;
  return base;
}

function pendingDetail(): MatchDetail {
  const base = scheduledDetail();
  base.fixture.scheduledAt = null;
  base.fixture.status = "pending";
  return base;
}

function walkoverDetail(): MatchDetail {
  const base = playedDetail();
  base.result = null; // forfeit: snapshot absent, scores present
  base.fixture.scheduledAt = null;
  base.fixture.homeScore = 2;
  base.fixture.awayScore = 0;
  base.fixture.status = "played";
  return base;
}

function stubMatch(detail: MatchDetail) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(detail) }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPlayed() {
  return render(<MatchView leagueId="l1" fixtureId="f1" />);
}

describe("MatchView — played full summary (MV-2)", () => {
  it("renders score, winner, teams with race + coach, FF, winnings, casualties, weather and the +4 MVP row", async () => {
    stubMatch(playedDetail());
    renderPlayed();

    // Scoreboard: score + winner team name (Reavers won). The team name also
    // appears in the teams section and header, so use findAllByText.
    const winnerNames = await screen.findAllByText("Reavers");
    expect(winnerNames.length).toBeGreaterThan(0);

    // Teams: both names render (race + coach come along in the summary). Coach
    // names sit inside a combined `<p>` so match substrings.
    expect(screen.getAllByText("Dwarves").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Coach A/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Coach B/).length).toBeGreaterThan(0);

    // Dedicated fans postFf.
    expect(screen.getByText(/Afición/)).toBeTruthy();

    // Winnings.
    expect(screen.getByText(/Ganancias/)).toBeTruthy();

    // Casualty labels (Spanish rulebook).
    expect(screen.getByText(/Herida grave/)).toBeTruthy();
    expect(screen.getByText(/Muerto/)).toBeTruthy();

    // Weather Spanish label.
    expect(screen.getByText(/Calor asfixiante/)).toBeTruthy();

    // +4 PE MVP row for the persisted grantee (one badge per side that resolved).
    expect(screen.getAllByText(/Blitzer A/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\+4 PE/).length).toBeGreaterThan(0);
  });
});

describe("MatchView — scheduled / pending (MV-3, D16 consent-start)", () => {
  it("shows the consent-start panel (not the legacy 'Programado:' date) for a scheduled fixture", async () => {
    stubLiveEventSource();
    stubMatch(scheduledDetail());
    renderPlayed();

    // A scheduled fixture now renders the two-phase consent start (D16).
    expect(await screen.findByText(/Partido programado/)).toBeTruthy();
    expect(screen.queryByText(/Programado:/)).toBeNull();
  });

  it("shows a pending notice with no date for a pending fixture", async () => {
    stubMatch(pendingDetail());
    renderPlayed();

    expect(await screen.findByText(/Sin jornada programada/)).toBeTruthy();
    expect(screen.queryByText(/Programado:/)).toBeNull();
  });
});

describe("MatchView — walkover and inert live shells (MV-2/MV-5/MV-6)", () => {
  it("renders the fixture scores + walkover notice and zero summary sections", async () => {
    stubMatch(walkoverDetail());
    renderPlayed();

    // Walkover notice copy.
    expect(await screen.findByText(/Victoria por incomparecencia/)).toBeTruthy();

    // A walkover shows no scoreboard/teams/fans/winnings/casualties/weather rows.
    expect(screen.queryByText(/Afición/)).toBeNull();
    expect(screen.queryByText(/Ganancias/)).toBeNull();
    expect(screen.queryByText(/Clima/)).toBeNull();
  });

  it("renders no visible live/timeline/clock shells in played, scheduled or pending states", async () => {
    const cases = [playedDetail(), scheduledDetail(), pendingDetail(), walkoverDetail()];
    for (const detail of cases) {
      vi.unstubAllGlobals();
      stubLiveEventSource(); // scheduled renders LiveActiveMatch (consent panel)
      stubMatch(detail);
      const { container } = renderPlayed();
      await waitFor(() => expect(container.textContent?.length ?? 0).toBeGreaterThan(0));
      // No turn/clock/half/event-feed digits appear in ANY pre-live state.
      expect(container.textContent).not.toMatch(/turno \d|tiempo|mitad|evento|:\d{2}/i);
    }
  });
});

/** A scheduled fixture with an active LiveMatch (status live). */
function liveDetail(overrides: Partial<MatchDetail> = {}): MatchDetail {
  const raw = scheduledDetail();
  return {
    ...raw,
    live: {
      seq: 6,
      status: "live",
      half: 1,
      turnNumber: 3,
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      viewerSide: "home",
      startedAt: 8000,
      elapsed: 2100,
      homeTurnMs: 2100,
      awayTurnMs: 0,
      homeScore: 1,
      awayScore: 0,
      paused: false,
      finishedAt: null,
      events: [
        { seq: 1, kind: "start", side: null, playerRosterId: null, half: 1, turnNumber: 1, payload: {}, at: 1000 },
        { seq: 5, kind: "td", side: "home", playerRosterId: "p1", half: 1, turnNumber: 3, payload: {}, at: 9000 },
      ],
    },
    ...overrides,
  };
}

/** A hub fan-out frame carrying delta events (viewerSide null per D19). */
function liveFrameWithEvents(
  seq: number,
  overrides: Partial<LiveMatchViewState>,
  events: Record<string, unknown>[],
): string {
  const base = liveDetail().live!;
  return JSON.stringify({
    seq,
    status: "live",
    half: base.half,
    turnNumber: base.turnNumber,
    activeSide: base.activeSide,
    homeConsented: true,
    awayConsented: true,
    viewerSide: null,
    startedAt: base.startedAt,
    elapsed: base.elapsed,
    homeTurnMs: base.homeTurnMs,
    awayTurnMs: base.awayTurnMs,
    paused: false,
    homeScore: base.homeScore,
    awayScore: base.awayScore,
    finishedAt: null,
    ...overrides,
    events,
  });
}

/** A played fixture whose LiveMatch finished (persisted timeline). */
function finishedLiveDetail(): MatchDetail {
  const raw = playedDetail();
  return {
    ...raw,
    live: {
      seq: 12,
      status: "finished",
      half: 2,
      turnNumber: 8,
      activeSide: "away",
      homeConsented: true,
      awayConsented: true,
      viewerSide: null,
      startedAt: 1000,
      elapsed: 3100,
      homeTurnMs: 1500,
      awayTurnMs: 1600,
      homeScore: 2,
      awayScore: 1,
      paused: false,
      finishedAt: 5000,
      events: [
        { seq: 1, kind: "start", side: null, playerRosterId: null, half: 1, turnNumber: 1, payload: {}, at: 1000 },
        { seq: 5, kind: "td", side: "home", playerRosterId: "p1", half: 1, turnNumber: 3, payload: {}, at: 2000 },
        { seq: 9, kind: "casualty", side: "away", playerRosterId: "p3", half: 2, turnNumber: 6, payload: { band: "grave" }, at: 3000 },
        { seq: 10, kind: "endMatch", side: null, playerRosterId: null, half: 2, turnNumber: 8, payload: {}, at: 4000 },
      ],
    } as LiveMatchView,
  };
}

describe("MatchView — live fixture (MV-5 shells fed + controls)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders the live turn bar, unified clock, score and event feed from the live state", async () => {
    stubLiveEventSource();
    stubMatch(liveDetail());
    const { container } = renderPlayed();

    // The live section shows real server state: header (half/turn), score.
    expect((await screen.findAllByText(/Mitad 1 · Turno 3/)).length).toBeGreaterThan(0);
    // Hero scoreboard: big "1 : 0" digits (mockup format).
    expect(screen.getByTestId("live-score").textContent).toMatch(/1\s*:\s*0/);
    // Per-coach clock (homeTurnMs=2100 → H:MM:SS 0:00:02) + the unified Tiempo.
    expect(container.textContent).toMatch(/0:00:02/);
    expect(container.textContent).toMatch(/Tiempo/);
    // The timeline legend reuses the Spanish labels for the TD + start events.
    expect(screen.getAllByText(/Touchdown/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Inicio del partido/).length).toBeGreaterThan(0);
  });

  it("renders hero mini-stats via deriveTeamStats (LM-19: 1td+1comp+1lastingcas+1foul → 1/1/1/1/★6)", async () => {
    stubLiveEventSource();
    // The initial snapshot carries the full LM-19 home event set (the hub frame
    // only carries DELTAS, so seed the timeline in the detail).
    const detail = liveDetail();
    detail.live = {
      ...detail.live!,
      events: [
        { seq: 1, kind: "start", side: null, playerRosterId: null, half: 1, turnNumber: 1, payload: {}, at: 8000 },
        { seq: 5, kind: "td", side: "home", playerRosterId: "p1", half: 1, turnNumber: 3, payload: {}, at: 9000 },
        { seq: 6, kind: "completion", side: "home", playerRosterId: "p2", half: 1, turnNumber: 3, payload: {}, at: 9100 },
        { seq: 7, kind: "casualty", side: "home", playerRosterId: "p1", half: 1, turnNumber: 3, payload: { band: "grave" }, at: 9200 },
        { seq: 8, kind: "foul", side: "home", playerRosterId: "p2", half: 1, turnNumber: 3, payload: {}, at: 9300 },
      ],
    };
    stubMatch(detail);
    renderPlayed();
    await waitFor(() => expect(screen.getByTestId("live-stats").textContent).toContain("★6"));
    const stats = screen.getByTestId("live-stats");
    expect(stats.textContent).toMatch(/TD/);
    expect(stats.textContent).toMatch(/1 · 0/);
    expect(stats.textContent).toMatch(/Comp/);
    expect(stats.textContent).toMatch(/Bajas/);
    expect(stats.textContent).toMatch(/Faltas/);
    expect(stats.textContent).toContain("★6");
  });

  it("sends a control command when the coach clicks 'Dar el turno'", async () => {
    const fetchMock = vi.fn((url: string) => {
      // getMatchDetail GET → the live detail; sendCommand POST → the new view.
      return Promise.resolve(
        /\/live$/.test(url)
          ? { ok: true, status: 200, json: () => Promise.resolve({ view: { seq: 7, status: "live", half: 1, turnNumber: 4, activeSide: "away", homeConsented: true, awayConsented: true, viewerSide: "home", startedAt: 8000, elapsed: 2400, homeTurnMs: 2100, awayTurnMs: 300, paused: false, homeScore: 1, awayScore: 0, finishedAt: null } }) }
          : { ok: true, status: 200, json: () => Promise.resolve(liveDetail()) },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    stubLiveEventSource();

    renderPlayed();
    expect((await screen.findAllByText(/Mitad 1 · Turno 3/)).length).toBeGreaterThan(0);
    act(() => {
      screen.getByRole("button", { name: /Dar el turno/i }).click();
    });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/leagues/l1/fixtures/f1/live",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("shows 'Tu turno' + 'Dar el turno' for the ACTIVE coach (viewerSide === activeSide, LM-12/D19)", async () => {
    stubLiveEventSource();
    stubMatch(liveDetail()); // viewerSide home, activeSide home → active
    renderPlayed();

    expect((await screen.findAllByText(/Mitad 1 · Turno 3/)).length).toBeGreaterThan(0);
    // The active coach sees the "Tu turno" notice + the pass control.
    expect(screen.getAllByText(/Tu turno/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Dar el turno/i })).toBeTruthy();
    // The active coach does not see the "Pedir turno" nudge.
    expect(screen.queryByRole("button", { name: /Pedir turno/i })).toBeNull();
  });

  it("shows 'Pedir turno' (and no 'Dar el turno') for the NON-active coach", async () => {
    stubLiveEventSource();
    // The away coach (u2) is the viewer; the active side is home → NOT the active one.
    vi.mocked(useSession).mockReturnValue({ data: { user: { id: "u2" } } } as never);
    const detail = liveDetail();
    detail.live = { ...detail.live!, viewerSide: "away" };
    stubMatch(detail);
    renderPlayed();

    // viewerSide away, activeSide home → the away coach is NOT the active one.
    expect((await screen.findAllByText(/Mitad 1 · Turno 3/)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Pedir turno/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Dar el turno/i })).toBeNull();
    expect(screen.queryByText(/Tu turno/)).toBeNull();
  });
});

/** A promise whose resolution the test controls (a pending fetch response). */
function deferredResponse(): { promise: Promise<unknown>; resolve: (value: unknown) => void } {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** The view the server returns after the home coach's endTurn (one flip). */
const turnFlippedView = () => ({
  seq: 7,
  status: "live",
  half: 1,
  turnNumber: 4,
  activeSide: "away",
  homeConsented: true,
  awayConsented: true,
  viewerSide: "home",
  startedAt: 8000,
  elapsed: 2400,
  homeTurnMs: 2100,
  awayTurnMs: 300,
  paused: false,
  homeScore: 1,
  awayScore: 0,
  finishedAt: null,
});

describe("MatchView — double-click guard on live commands (in-flight lock)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("advances the turn by exactly one on a normal single 'Dar el turno' click", async () => {
    stubLiveEventSource();
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        /\/live$/.test(url)
          ? { ok: true, status: 200, json: () => Promise.resolve({ view: turnFlippedView() }) }
          : { ok: true, status: 200, json: () => Promise.resolve(liveDetail()) },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    stubLiveEventSource();

    renderPlayed();
    expect((await screen.findAllByText(/Mitad 1 · Turno 3/)).length).toBeGreaterThan(0);
    act(() => {
      screen.getByRole("button", { name: /Dar el turno/i }).click();
    });

    // Exactly ONE live POST, and the turn advances by one (3 → 4, no jump to 5).
    await waitFor(() => {
      const livePosts = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/live"));
      expect(livePosts).toHaveLength(1);
    });
    await waitFor(() => {
      expect(screen.getAllByText(/Mitad 1 · Turno 4/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/Mitad 1 · Turno 5/)).toBeNull();
  });

  it("drops a rapid second 'Dar el turno' while the first command is in flight (one flip, not two)", async () => {
    stubLiveEventSource();
    const { promise, resolve } = deferredResponse();
    let livePostCount = 0;
    const fetchMock = vi.fn((url: string) => {
      if (/\/live$/.test(url)) {
        livePostCount += 1;
        return promise;
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(liveDetail()) });
    });
    vi.stubGlobal("fetch", fetchMock);
    stubLiveEventSource();

    renderPlayed();
    expect((await screen.findAllByText(/Mitad 1 · Turno 3/)).length).toBeGreaterThan(0);
    const button = screen.getByRole("button", { name: /Dar el turno/i });

    // Two synchronous clicks while the first POST is still pending (a double-click).
    act(() => {
      button.click();
      button.click();
    });

    // The in-flight ref lock drops the second invocation — ONE command.
    expect(livePostCount).toBe(1);

    // The server resolves → the optimistic view applies: one flip to turn 4.
    act(() => {
      resolve({ ok: true, status: 200, json: () => Promise.resolve({ view: turnFlippedView() }) });
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Mitad 1 · Turno 4/).length).toBeGreaterThan(0);
    });
    // No second flip: turn 5 never renders and no extra command was sent.
    expect(livePostCount).toBe(1);
    expect(screen.queryByText(/Mitad 1 · Turno 5/)).toBeNull();
  });
});

describe("MatchView — mockup layout + client ticking clock", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders the mockup structure: turn tracks with the current turn highlighted, hero blocks and timeline dots", async () => {
    stubLiveEventSource();
    stubMatch(liveDetail());
    const { container } = renderPlayed();
    await screen.findAllByText(/Mitad 1 · Turno 3/);

    // Top bar: league/jornada label + half indicator.
    expect(container.textContent).toMatch(/Jornada 1/);
    expect(container.textContent).toMatch(/1ª PARTE/);

    // Turn tracks: 8 cells per team (16 total), exactly ONE current turn is
    // highlighted — the ACTIVE side's OWN isolated turn count (per-team, not the
    // global number): half 1 turn 3 (home active) → home is on its 2nd turn,
    // away has completed its 1st.
    const cells = screen.getAllByLabelText(/Turno \d/);
    expect(cells).toHaveLength(16);
    const highlighted = cells.filter((c) => c.getAttribute("aria-current") === "true");
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].textContent).toBe("2");

    // Isolation: the AWAY track shows its own completed count (1) as done and
    // has NO aria-current; the HOME track marks only its own done turns (1).
    const homeTrack = screen.getByLabelText(/Turnos de Reavers/);
    const awayTrack = screen.getByLabelText(/Turnos de Dwarves/);
    expect(homeTrack.querySelector('[aria-current="true"]')?.textContent).toBe("2");
    expect(awayTrack.querySelector('[aria-current="true"]')).toBeNull();
    expect(within(awayTrack).getByLabelText("Turno 1").textContent).toBe("1");
    expect(within(awayTrack).getByLabelText("Turno 1").className).toContain("bg-[#12225a]");
    expect(within(awayTrack).getByLabelText("Turno 2").className).not.toContain("bg-[#12225a]");
    expect(within(homeTrack).getByLabelText("Turno 2").className).toContain("bg-[#d11938]");

    // Hero: the team blocks mirror the center scoreboard (race · coach line).
    expect(screen.getAllByText(/Reavers/).length).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/Human · Coach A/);
    expect(container.textContent).toMatch(/Dwarf · Coach B/);

    // Stats grid derived via deriveTeamStats: only the rows we have data for
    // (TD present; no casualties → no "Bajas" row).
    expect(screen.getByText("TD")).toBeTruthy();
    expect(screen.queryByText("Bajas")).toBeNull();

    // Design-A timeline: one row per display event (start + td) with the
    // Spanish label + ★ SPP; the no-player start row renders the label only.
    expect(container.querySelectorAll("[data-testid='live-event-row']").length).toBe(2);
    expect(screen.getByText(/Inicio del partido/)).toBeTruthy();
    expect(screen.getByText(/Touchdown/)).toBeTruthy();
  });

  it("ticks the unified clock and the ACTIVE coach's clock every second while live", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-08-13T10:00:00Z"));
    stubLiveEventSource();
    stubMatch(liveDetail());
    const { container } = renderPlayed();

    // Flush the detail/league fetches so LiveActiveMatch mounts and anchors the
    // clock; the per-coach clock starts at homeTurnMs 2100 → 0:00:02.
    await act(async () => {});
    expect(container.textContent).toMatch(/0:00:02/);

    // After 3s of ticks the ACTIVE side's clock + the unified Tiempo advance.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(container.textContent).toMatch(/0:00:05/);
    // The NON-active (away) side stays frozen at 0:00:00.
    expect(container.textContent).toMatch(/0:00:00/);
  });
});

describe("teamTurnCounts — isolated per-team turn counters (BB rulebook)", () => {
  it("half 1 starts with home: each team's track advances only on ITS turns", () => {
    // turn 1 (home active): home on its 1st, away none yet.
    expect(teamTurnCounts(1, 1)).toEqual({ home: 1, away: 0 });
    // turn 2 (away active): home done 1, away on its 1st.
    expect(teamTurnCounts(1, 2)).toEqual({ home: 1, away: 1 });
    // turn 3 (home active): home on its 2nd, away done 1.
    expect(teamTurnCounts(1, 3)).toEqual({ home: 2, away: 1 });
    // turn 4 (away active): home done 2, away on its 2nd.
    expect(teamTurnCounts(1, 4)).toEqual({ home: 2, away: 2 });
    // end of half 1: each team played 4 turns.
    expect(teamTurnCounts(1, 8)).toEqual({ home: 4, away: 4 });
  });

  it("half 2 starts with away (advanceTurnIndex): the roles swap", () => {
    expect(teamTurnCounts(2, 1)).toEqual({ home: 0, away: 1 });
    expect(teamTurnCounts(2, 2)).toEqual({ home: 1, away: 1 });
    expect(teamTurnCounts(2, 5)).toEqual({ home: 2, away: 3 });
    expect(teamTurnCounts(2, 8)).toEqual({ home: 4, away: 4 });
  });
});

describe("MatchView — two-phase consent / begin (LM-11, D16)", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A scheduled fixture with no LiveMatch row yet → consent start panel. */
  function scheduledNoLive(): MatchDetail {
    const raw = scheduledDetail();
    // No row: the fixture is scheduled with no LiveMatch.
    return { ...raw, live: null };
  }

  it("shows 'Iniciar partido' for a home coach on a scheduled fixture with no live row", async () => {
    stubLiveEventSource();
    stubMatch(scheduledNoLive());
    renderPlayed();

    // The consent-start panel renders for a scheduled fixture with no row.
    expect(await screen.findByText(/Partido programado/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Iniciar partido/i })).toBeTruthy();
  });

  it("shows a pending 'listo, esperando al rival' state after the first consent", async () => {
    stubLiveEventSource();
    const detail = scheduledNoLive();
    detail.live = {
      seq: 1,
      status: "pending",
      half: 1,
      turnNumber: 1,
      activeSide: "home",
      homeConsented: true,
      awayConsented: false,
      viewerSide: "home",
      startedAt: null,
      elapsed: 0,
      homeTurnMs: 0,
      awayTurnMs: 0,
      paused: false,
      homeScore: 0,
      awayScore: 0,
      finishedAt: null,
      events: [],
    };
    stubMatch(detail);
    renderPlayed();

    // The home coach sees their side confirmed + the retract control.
    expect(await screen.findByText(/Listo, esperando al rival/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retirar consentimiento/i })).toBeTruthy();
  });

  it("shows 'Empezar partido' (begin) once both coaches consent (ready)", async () => {
    stubLiveEventSource();
    const detail = scheduledNoLive();
    detail.live = {
      seq: 2,
      status: "ready",
      half: 1,
      turnNumber: 1,
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      viewerSide: "home",
      startedAt: null,
      elapsed: 0,
      homeTurnMs: 0,
      awayTurnMs: 0,
      paused: false,
      homeScore: 0,
      awayScore: 0,
      finishedAt: null,
      events: [],
    };
    stubMatch(detail);
    renderPlayed();

    expect(await screen.findByText(/Listo para empezar/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Empezar partido/i })).toBeTruthy();
  });

  it("sends a begin command when the coach clicks 'Empezar partido'", async () => {
    stubLiveEventSource();
    const detail = scheduledNoLive();
    detail.live = {
      seq: 2,
      status: "ready",
      half: 1,
      turnNumber: 1,
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      viewerSide: "home",
      startedAt: null,
      elapsed: 0,
      homeTurnMs: 0,
      awayTurnMs: 0,
      paused: false,
      homeScore: 0,
      awayScore: 0,
      finishedAt: null,
      events: [],
    };
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        /\/live$/.test(url)
          ? { ok: true, status: 200, json: () => Promise.resolve({ view: { seq: 3, status: "live", half: 1, turnNumber: 1, activeSide: "home", homeConsented: true, awayConsented: true, viewerSide: "home", startedAt: 1000, elapsed: 0, homeTurnMs: 0, awayTurnMs: 0, paused: false, homeScore: 0, awayScore: 0, finishedAt: null } }) }
          : { ok: true, status: 200, json: () => Promise.resolve(detail) },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    stubLiveEventSource();
    renderPlayed();

    expect(await screen.findByText(/Listo para empezar/)).toBeTruthy();
    act(() => {
      screen.getByRole("button", { name: /Empezar partido/i }).click();
    });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/leagues/l1/fixtures/f1/live",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    // The POST body is the begin command (two-phase lifecycle, LM-11).
    const livePost = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/live"));
    expect(livePost).toBeDefined();
    const init = (livePost as unknown[])[1] as { body: string };
    expect((JSON.parse(init.body) as { type: string }).type).toBe("begin");
  });
});

describe("MatchView — D19: viewerSide survives hub state frames (no viewerSide)", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A hub fan-out `state` frame: authoritative live fields, viewerSide null (D19). */
  function hubFrame(overrides: Partial<LiveMatchViewState> = {}): string {
    return JSON.stringify({
      seq: 1,
      status: "pending",
      half: 1,
      turnNumber: 1,
      activeSide: "home",
      homeConsented: false,
      awayConsented: false,
      viewerSide: null,
      startedAt: null,
      elapsed: 0,
      homeTurnMs: 0,
      awayTurnMs: 0,
      paused: false,
      homeScore: 0,
      awayScore: 0,
      finishedAt: null,
      ...overrides,
    });
  }

  it("keeps the consent button for the home coach when a hub frame (no viewerSide) applies", async () => {
    stubLiveEventSource();
    stubMatch(scheduledDetail());
    renderPlayed();

    expect(await screen.findByText(/Partido programado/)).toBeTruthy();
    // The coach has not yet consented — the "Iniciar partido" button is live.
    expect(screen.getByRole("button", { name: /Iniciar partido/i })).toBeTruthy();

    // The hub's fan-out `state` frame carries NO viewerSide (D19) and overwrites
    // hookLive → viewerSide must survive via the session-derived prop.
    act(() => {
      liveInstances[0]?.dispatch("state", hubFrame());
    });

    // Regression: the frame previously blanked the side → "Esperando a los
    // entrenadores..." with no button.
    expect(screen.getByRole("button", { name: /Iniciar partido/i })).toBeTruthy();
  });

  it("keeps 'Listo, esperando al rival.' after the consent POST is overwritten by a hub frame", async () => {
    stubLiveEventSource();
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        /\/live$/.test(url)
          ? {
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({
                  view: {
                    seq: 1,
                    status: "pending",
                    half: 1,
                    turnNumber: 1,
                    activeSide: "home",
                    homeConsented: true,
                    awayConsented: false,
                    viewerSide: "home",
                    startedAt: null,
                    elapsed: 0,
                    homeTurnMs: 0,
                    awayTurnMs: 0,
                    paused: false,
                    homeScore: 0,
                    awayScore: 0,
                    finishedAt: null,
                  },
                }),
            }
          : { ok: true, status: 200, json: () => Promise.resolve(scheduledDetail()) },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    stubLiveEventSource();
    renderPlayed();

    const button = await screen.findByRole("button", { name: /Iniciar partido/i });
    act(() => {
      button.click();
    });
    // The consent POST response (viewerSide home) shows the waiting state.
    expect(await screen.findByText(/Listo, esperando al rival/)).toBeTruthy();

    // The hub's fan-out frame (viewerSide null) arrives right after the POST.
    act(() => {
      liveInstances[0]?.dispatch("state", hubFrame({ homeConsented: true, awayConsented: false }));
    });

    // The viewer still knows their side → the waiting state (and retract) persists.
    expect(screen.getByText(/Listo, esperando al rival/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retirar consentimiento/i })).toBeTruthy();
  });

  it("renders 'Empezar partido' from a ready hub frame and drives begin on click", async () => {
    stubLiveEventSource();
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        /\/live$/.test(url)
          ? {
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({
                  view: {
                    seq: 3,
                    status: "live",
                    half: 1,
                    turnNumber: 1,
                    activeSide: "home",
                    homeConsented: true,
                    awayConsented: true,
                    viewerSide: "home",
                    startedAt: 1000,
                    elapsed: 0,
                    homeTurnMs: 0,
                    awayTurnMs: 0,
                    paused: false,
                    homeScore: 0,
                    awayScore: 0,
                    finishedAt: null,
                  },
                }),
            }
          : { ok: true, status: 200, json: () => Promise.resolve(scheduledDetail()) },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    stubLiveEventSource();
    renderPlayed();

    expect(await screen.findByText(/Partido programado/)).toBeTruthy();
    // Both coaches consented → the ready state arrives via the hub frame (no viewerSide).
    act(() => {
      liveInstances[0]?.dispatch(
        "state",
        hubFrame({ seq: 2, status: "ready", homeConsented: true, awayConsented: true }),
      );
    });

    expect(await screen.findByText(/Listo para empezar/)).toBeTruthy();
    act(() => {
      screen.getByRole("button", { name: /Empezar partido/i }).click();
    });

    await waitFor(() => {
      const livePost = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/live"));
      expect(livePost).toBeDefined();
      const init = (livePost as unknown[])[1] as { body: string };
      expect((JSON.parse(init.body) as { type: string }).type).toBe("begin");
    });
  });

  it("keeps 'Pedir turno' for the NON-active coach after a live hub frame (LM-12)", async () => {
    stubLiveEventSource();
    // The away coach (u2) is the viewer — the prop, not the DTO, is authoritative.
    vi.mocked(useSession).mockReturnValue({ data: { user: { id: "u2" } } } as never);
    const detail = liveDetail();
    detail.live = { ...detail.live!, viewerSide: "away" };
    stubMatch(detail);
    renderPlayed();

    expect((await screen.findAllByText(/Mitad 1 · Turno 3/)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Pedir turno/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Dar el turno/i })).toBeNull();

    // Live-phase hub frame (viewerSide null) — the away coach keeps the control.
    act(() => {
      liveInstances[0]?.dispatch(
        "state",
        hubFrame({
          seq: 7,
          status: "live",
          half: 1,
          turnNumber: 3,
          activeSide: "home",
          homeConsented: true,
          awayConsented: true,
          startedAt: 8000,
          elapsed: 2400,
          homeTurnMs: 2100,
          awayTurnMs: 300,
          homeScore: 1,
          awayScore: 0,
        }),
      );
    });

    expect(screen.getByRole("button", { name: /Pedir turno/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Dar el turno/i })).toBeNull();
    expect(screen.queryByText(/Tu turno/)).toBeNull();
  });
});

describe("MatchView — 'Tu rival pide el turno' nudge banner (LM-13, D17)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const requestTurn = (seq: number, side: "home" | "away") => ({
    seq,
    kind: "requestTurn",
    side,
    playerRosterId: null,
    half: 1,
    turnNumber: 3,
    payload: {},
    at: 5000,
  });

  it("shows the banner on the ACTIVE coach's page when the opponent's requestTurn arrives live", async () => {
    stubLiveEventSource();
    stubMatch(liveDetail()); // home coach (u1) viewer, activeSide home → active
    renderPlayed();

    expect((await screen.findAllByText(/Mitad 1 · Turno 3/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Tu rival pide el turno/)).toBeNull();

    // The away (opponent) coach nudges → a requestTurn event frame arrives.
    act(() => {
      liveInstances[0]?.dispatch("state", liveFrameWithEvents(7, {}, [requestTurn(7, "away")]));
    });
    expect(screen.getByText(/Tu rival pide el turno/)).toBeTruthy();
  });

  it("does NOT restore the banner after a reload (D25: the snapshot feed is filtered live-only)", async () => {
    stubLiveEventSource();
    // The server filters `requestTurn` from the feed DTOs (LM-16/D25), so a
    // reload's snapshot never carries the nudge — the banner is LIVE-only.
    const detail = liveDetail();
    detail.live = { ...detail.live!, events: [] }; // snapshot has no persisted nudge
    stubMatch(detail);
    renderPlayed();

    expect((await screen.findAllByText(/Mitad 1 · Turno 3/)).length).toBeGreaterThan(0);
    // A reloaded (filtered) snapshot restores NO nudge banner.
    expect(screen.queryByText(/Tu rival pide el turno/)).toBeNull();
  });

  it("clears the banner when the turn flips (a turnStart event arrives)", async () => {
    stubLiveEventSource();
    stubMatch(liveDetail());
    renderPlayed();

    expect((await screen.findAllByText(/Mitad 1 · Turno 3/)).length).toBeGreaterThan(0);
    act(() => {
      liveInstances[0]?.dispatch("state", liveFrameWithEvents(7, {}, [requestTurn(7, "away")]));
    });
    expect(screen.getByText(/Tu rival pide el turno/)).toBeTruthy();

    // The active coach passes the turn → the opponent's turnStart lands.
    act(() => {
      liveInstances[0]?.dispatch(
        "state",
        liveFrameWithEvents(8, { activeSide: "away", turnNumber: 4 }, [
          { seq: 8, kind: "turn", side: null, playerRosterId: null, half: 1, turnNumber: 4, payload: {}, at: 6000 },
          { seq: 9, kind: "turnStart", side: "away", playerRosterId: null, half: 1, turnNumber: 4, payload: {}, at: 6000 },
        ]),
      );
    });
    expect(screen.queryByText(/Tu rival pide el turno/)).toBeNull();
  });

  it("does NOT show the banner to the requester (non-active coach)", async () => {
    stubLiveEventSource();
    // The away coach (u2) is the viewer; the active side is home → requester view.
    vi.mocked(useSession).mockReturnValue({ data: { user: { id: "u2" } } } as never);
    const detail = liveDetail();
    detail.live = { ...detail.live!, viewerSide: "away" };
    stubMatch(detail);
    renderPlayed();

    expect((await screen.findAllByText(/Mitad 1 · Turno 3/)).length).toBeGreaterThan(0);
    act(() => {
      liveInstances[0]?.dispatch("state", liveFrameWithEvents(7, {}, [requestTurn(7, "away")]));
    });
    expect(screen.queryByText(/Tu rival pide el turno/)).toBeNull();
    expect(screen.getByRole("button", { name: /Pedir turno/i })).toBeTruthy();
  });
});

describe("MatchView — finished live match timeline (LM-10 / Design-A, LM-17)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders the Design-A chronological row list from persisted events", async () => {
    stubMatch(finishedLiveDetail());
    const { container } = renderPlayed();
    await waitFor(() => expect(container.textContent).toContain("Inicio del partido"));

    // Design-A rows carry minute + global turn tag + player name + label + ★.
    // home TD at at=2000, startedAt=1000 → minute 1'; half 1 turn 3 → T3.
    expect(container.textContent).toContain("Touchdown");
    expect(container.textContent).toContain("Blitzer A");
    // LM-18: a lasting casualty band renders the Design-A bucket "Baja".
    expect(container.textContent).toContain("Baja");
    expect(container.textContent).toContain("Blitzer B");
    expect(container.textContent).toContain("Fin del partido");
    // ★ SPP via eventSpp: td ★3, lasting casualty ★2.
    expect(container.textContent).toContain("★3");
    expect(container.textContent).toContain("★2");
    // Final scoreboard 2 – 1.
    expect(container.textContent).toMatch(/2\s*–\s*1/);
  });

  it("renders minute, global turn tag and dorsal per row from liveFeed derivations", async () => {
    stubMatch(finishedLiveDetail());
    const { container } = renderPlayed();
    await waitFor(() => expect(container.textContent).toContain("Inicio del partido"));

    // td at=2000 from startedAt=1000 → 0'; half 1 turn 3 → T3.
    expect(container.textContent).toContain("T3");
    // dorsal = roster index+1: home Blitzer A (p1) → #1.
    expect(container.textContent).toContain("#1");
  });

  it("renders a null-player row (start/boundary) gracefully with no dorsal/name", async () => {
    stubMatch(finishedLiveDetail());
    const { container } = renderPlayed();
    await waitFor(() => expect(container.textContent).toContain("Inicio del partido"));
    // The `start` event has playerRosterId null → no dorsal/name, label only;
    // while a player row (td → Blitzer A) DOES carry a dorsal (#1) and name.
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    const startRow = rows.find((li) => li.textContent?.includes("Inicio del partido"));
    const tdRow = rows.find((li) => li.textContent?.includes("Touchdown"));
    expect(startRow).toBeTruthy();
    expect(startRow!.textContent).not.toMatch(/#\d/);
    expect(startRow!.textContent).not.toMatch(/Blitzer/);
    // The td row resolves its player: dorsal #1 + "Blitzer A" name.
    expect(tdRow).toBeTruthy();
    expect(tdRow!.textContent).toContain("#1");
    expect(tdRow!.textContent).toContain("Blitzer A");
  });
});

describe("MatchView — copy + tokens + notFound (MV-7)", () => {
  it("renders Spanish league-section copy and rulebook-light tokens only", async () => {
    stubMatch(playedDetail());
    const { container } = renderPlayed();
    await screen.findAllByText("Reavers"); // header/winner/teams all render

    // Rulebook-light tokens only: navy #12225a, red #d11938, bg #f8fafc, white.
    const html = container.outerHTML;
    expect(html).toContain("#12225a");
    expect(html).toContain("#d11938");
    expect(html).not.toMatch(/dark|bg-black|text-black/i);
  });

  it("collapses to the not-found view when the API returns 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) }),
      ),
    );
    renderPlayed();

    expect(await screen.findByText(/Partido no encontrado/)).toBeTruthy();
  });
});
