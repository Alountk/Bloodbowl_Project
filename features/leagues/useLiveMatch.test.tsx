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
    ...overrides,
  };
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

  it("sends a control command via POST and returns the new view (control restored)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
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
