import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useLiveMatch } from "./useLiveMatch";
import type { LiveCommand, LiveMatchViewState } from "./api";

/**
 * Fake EventSource used by the hook tests. It records the URL, exposes
 * `dispatch(event)` so a test can drive named events, and tracks `close`.
 */
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

  /** Simulates delivering a named SSE event (`event.data` / `event.lastEventId`). */
  dispatch(type: string, data: string, lastEventId?: string) {
    const listener = this.listeners[type];
    if (listener) listener({ data, lastEventId: lastEventId ?? "" } as unknown as MessageEvent);
  }
}

function liveSnapshot(overrides: Partial<LiveMatchViewState> = {}): LiveMatchViewState {
  return {
    seq: 9,
    status: "live",
    half: 1,
    turnNumber: 3,
    activeSide: "home",
    homeConsented: true,
    awayConsented: true,
    viewerSide: "home",
    startedAt: 1000,
    elapsed: 0,
    homeTurnMs: 0,
    awayTurnMs: 0,
    homeScore: 1,
    awayScore: 0,
    paused: false,
    finishedAt: null,
    concedeProposedBy: null,
    pendingCasualty: null,
    ...overrides,
  };
}

/** A hub fan-out frame: the full view + the transition's delta events (LM-8). */
function liveFrame(
  seq: number,
  overrides: Partial<LiveMatchViewState> & { kind?: string } = {},
  events: unknown[] = [],
) {
  return JSON.stringify({ ...liveSnapshot({ seq, ...overrides }), events });
}

function liveEvent(seq: number, kind = "turn"): Record<string, unknown> {
  return { seq, kind, side: null, playerRosterId: null, half: 1, turnNumber: 2, payload: {}, at: 2000 };
}

describe("useLiveMatch — connect / snapshot-first / reconnect / control", () => {
  const instances: FakeEventSource[] = [];

  beforeEach(() => {
    // Install a fake global EventSource the hook constructs.
    instances.length = 0;
    vi.stubGlobal(
      "EventSource",
      class extends FakeEventSource {
        constructor(url: string) {
          super(url);
          instances.push(this);
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("connects an EventSource to the fixture live route", () => {
    const { unmount } = renderHook(() => useLiveMatch({ leagueId: "lg-1", fixtureId: "f-1" }));
    expect(instances).toHaveLength(1);
    expect(instances[0].url).toBe("/api/leagues/lg-1/fixtures/f-1/live");
    unmount();
  });

  it("applies a snapshot-first event to the live state and keeps the stream open", async () => {
    const { result } = renderHook(() => useLiveMatch({ leagueId: "lg-1", fixtureId: "f-1" }));
    const es = instances[0];
    await act(async () => {
      es.dispatch("snapshot", JSON.stringify(liveSnapshot({ seq: 9, status: "live", homeTurnMs: 5000, awayTurnMs: 3000 })));
    });

    expect(result.current.live?.seq).toBe(9);
    expect(result.current.live?.activeSide).toBe("home");
    expect(result.current.live?.homeScore).toBe(1);
    // No `id` on snapshot → EventSource cursor stays.
    expect(es.dispatch).toBeDefined();
  });

  it("applies state deltas by seq and prepends/replaces on a reconnect snapshot", async () => {
    const { result, unmount } = renderHook(() => useLiveMatch({ leagueId: "lg-1", fixtureId: "f-1" }));
    const es = instances[0];

    await act(async () => {
      es.dispatch("snapshot", JSON.stringify(liveSnapshot({ seq: 9, turnNumber: 3, homeTurnMs: 200, awayTurnMs: 0 })));
    });
    expect(result.current.live?.turnNumber).toBe(3);

    await act(async () => {
      es.dispatch("state", JSON.stringify(liveSnapshot({ seq: 10, turnNumber: 4, activeSide: "away", homeTurnMs: 200, awayTurnMs: 0 })), "10");
    });
    expect(result.current.live?.seq).toBe(10);
    expect(result.current.live?.activeSide).toBe("away");
    unmount();
  });

  it("surfaces a reconnect by re-applying the snapshot (EventSource last-event-id converges)", async () => {
    const { result, unmount } = renderHook(() => useLiveMatch({ leagueId: "lg-1", fixtureId: "f-1" }));
    const es = instances[0];

    await act(async () => {
      es.dispatch("snapshot", JSON.stringify(liveSnapshot({ seq: 9, turnNumber: 3, homeTurnMs: 200, awayTurnMs: 0 })));
    });
    await waitFor(() => expect(result.current.live?.seq).toBe(9));

    await act(async () => {
      es.dispatch("snapshot", JSON.stringify(liveSnapshot({ seq: 12, turnNumber: 5, activeSide: "away", homeTurnMs: 200, awayTurnMs: 100, awayScore: 1 })));
    });
    await waitFor(() => expect(result.current.live?.seq).toBe(12));
    await waitFor(() => expect(result.current.live?.awayScore).toBe(1));
    unmount();
  });

  it("applies the view from an `event` frame so the OTHER coach sees the turn flip live", async () => {
    const { result, unmount } = renderHook(() => useLiveMatch({ leagueId: "lg-1", fixtureId: "f-1" }));
    const es = instances[0];
    await act(async () => {
      es.dispatch("snapshot", JSON.stringify(liveSnapshot({ seq: 9, activeSide: "home" })));
    });
    expect(result.current.live?.activeSide).toBe("home");

    // The active coach passes the turn → the hub publishes an `event` frame.
    await act(async () => {
      es.dispatch(
        "event",
        liveFrame(10, { activeSide: "away", turnNumber: 4 }, [liveEvent(10), liveEvent(11, "turnStart")]),
        "10",
      );
    });

    expect(result.current.live?.seq).toBe(10);
    expect(result.current.live?.activeSide).toBe("away");
    unmount();
  });

  it("appends the frame's delta events to the timeline, deduped by seq and ordered", async () => {
    const { result, unmount } = renderHook(() => useLiveMatch({ leagueId: "lg-1", fixtureId: "f-1" }));
    const es = instances[0];
    await act(async () => {
      es.dispatch(
        "snapshot",
        JSON.stringify({
          ...liveSnapshot({ seq: 9 }),
          events: [liveEvent(1, "start"), liveEvent(5, "td")],
        }),
      );
    });
    expect(result.current.live?.events.map((e) => e.seq)).toEqual([1, 5]);

    // The next frame carries delta events; a stale seq (5) is deduped.
    await act(async () => {
      es.dispatch("event", liveFrame(11, {}, [liveEvent(5, "td"), liveEvent(11, "requestTurn")]));
    });
    expect(result.current.live?.events.map((e) => e.seq)).toEqual([1, 5, 11]);
    expect(result.current.live?.events[2].kind).toBe("requestTurn");
    unmount();
  });

  it("never wipes the accumulated events when a `state` frame applies", async () => {
    const { result, unmount } = renderHook(() => useLiveMatch({ leagueId: "lg-1", fixtureId: "f-1" }));
    const es = instances[0];
    await act(async () => {
      es.dispatch("event", liveFrame(9, {}, [liveEvent(9, "requestTurn")]));
    });
    expect(result.current.live?.events.map((e) => e.seq)).toEqual([9]);

    // A hub `state` frame (view only, no events) must not blank the timeline.
    await act(async () => {
      es.dispatch("state", JSON.stringify(liveSnapshot({ seq: 10, activeSide: "away", turnNumber: 4 })));
    });
    expect(result.current.live?.seq).toBe(10);
    expect(result.current.live?.events.map((e) => e.seq)).toEqual([9]);
    unmount();
  });

  it("caps the accumulated events at 200 to bound client growth", async () => {
    const { result, unmount } = renderHook(() => useLiveMatch({ leagueId: "lg-1", fixtureId: "f-1" }));
    const es = instances[0];
    await act(async () => {
      es.dispatch("snapshot", JSON.stringify({ ...liveSnapshot({ seq: 9 }), events: [] }));
      for (let i = 1; i <= 250; i++) {
        es.dispatch("event", liveFrame(i, {}, [liveEvent(i, i % 2 === 0 ? "turn" : "requestTurn")]));
      }
    });

    const events = result.current.live?.events ?? [];
    expect(events).toHaveLength(200);
    expect(events[0].seq).toBe(51);
    expect(events[199].seq).toBe(250);
    unmount();
  });

  it("ignores 1s tick frames (clock is derived locally by useLiveClock)", async () => {
    const { result, unmount } = renderHook(() => useLiveMatch({ leagueId: "lg-1", fixtureId: "f-1" }));
    const es = instances[0];
    await act(async () => {
      es.dispatch("snapshot", JSON.stringify(liveSnapshot({ seq: 9, homeTurnMs: 1000, awayTurnMs: 0 })));
    });
    await act(async () => {
      es.dispatch("event", liveFrame(9, { kind: "tick", homeTurnMs: 2000, awayTurnMs: 0 }, []));
    });
    // The tick frame neither rewrites the state nor appends events.
    expect(result.current.live?.homeTurnMs).toBe(1000);
    expect(result.current.live?.events).toHaveLength(0);
    unmount();
  });

  it("sends a control command via POST and returns the new view (control restored)", async () => {    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ view: liveSnapshot({ seq: 11, turnNumber: 5, activeSide: "away", homeTurnMs: 200, awayTurnMs: 100 }) }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useLiveMatch({ leagueId: "lg-1", fixtureId: "f-1" }));

    const cmd: LiveCommand = { type: "consent", side: "home" };
    let view: LiveMatchViewState | undefined;
    await act(async () => {
      view = await result.current.sendCommand(cmd);
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/leagues/lg-1/fixtures/f-1/live", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cmd),
    });
    expect(view?.seq).toBe(11);
    unmount();
  });

  it("maps a 409 control rejection into the sendCommand error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: "Sequence conflict" }),
      }),
    );
    const { result, unmount } = renderHook(() => useLiveMatch({ leagueId: "lg-1", fixtureId: "f-1" }));

    await expect(result.current.sendCommand({ type: "begin" })).rejects.toMatchObject({ status: 409 });
    unmount();
  });

  it("closes the EventSource on unmount", () => {
    const { unmount } = renderHook(() => useLiveMatch({ leagueId: "lg-1", fixtureId: "f-1" }));
    const es = instances[0];
    unmount();
    expect(es.close).toHaveBeenCalled();
  });
});
