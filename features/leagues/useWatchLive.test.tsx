import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useWatchLive } from "./useWatchLive";
import type { WatchLiveView } from "@/lib/watchAccess";

/**
 * Guest live hook tests (MSL-5). A FakeEventSource drives named SSE events; the
 * hook must apply the reduced snapshot/deltas, ignore the 1s tick frames (the
 * clock is derived locally by `useLiveClock`), and close on unmount.
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

  dispatch(type: string, data: string, lastEventId?: string) {
    const listener = this.listeners[type];
    if (listener) listener({ data, lastEventId: lastEventId ?? "" } as unknown as MessageEvent);
  }
}

/** A reduced guest live view (no private fields). */
function watchView(overrides: Partial<WatchLiveView> = {}): WatchLiveView {
  return {
    seq: 9,
    status: "live",
    half: 1,
    turnNumber: 3,
    activeSide: "home",
    homeScore: 1,
    awayScore: 0,
    startedAt: 1000,
    finishedAt: null,
    elapsed: 0,
    homeTurnMs: 0,
    awayTurnMs: 0,
    paused: false,
    viewerSide: null,
    events: [],
    ...overrides,
  };
}

function watchEvent(seq: number, kind = "td") {
  return { seq, kind, side: null, playerRosterId: null, half: 1, turnNumber: 2, payload: {}, at: 2000 };
}

describe("useWatchLive — connect / snapshot / frames", () => {
  const instances: FakeEventSource[] = [];

  beforeEach(() => {
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

  it("connects an EventSource to the guest live route", () => {
    const { unmount } = renderHook(() => useWatchLive({ token: "tok-1" }));
    expect(instances).toHaveLength(1);
    expect(instances[0].url).toBe("/api/watch/tok-1/live");
    unmount();
  });

  it("URL-encodes the token in the stream path", () => {
    const { unmount } = renderHook(() => useWatchLive({ token: "a/b+c" }));
    expect(instances[0].url).toBe("/api/watch/a%2Fb%2Bc/live");
    unmount();
  });

  it("applies a snapshot-first frame and exposes the reduced view", async () => {
    const { result } = renderHook(() => useWatchLive({ token: "tok-1" }));
    const es = instances[0];

    await act(async () => {
      es.dispatch("snapshot", JSON.stringify(watchView({ seq: 9, homeScore: 2, homeTurnMs: 5000 })));
    });

    expect(result.current.live?.seq).toBe(9);
    expect(result.current.live?.homeScore).toBe(2);
    expect(result.current.live?.homeTurnMs).toBe(5000);
    expect(result.current.live?.viewerSide).toBeNull();
  });

  it("clears the view on a `live: null` snapshot", async () => {
    const { result } = renderHook(() => useWatchLive({ token: "tok-1" }));
    const es = instances[0];

    await act(async () => {
      es.dispatch("snapshot", JSON.stringify(watchView({ seq: 9 })));
    });
    expect(result.current.live?.seq).toBe(9);

    await act(async () => {
      es.dispatch("event", JSON.stringify({ seq: 10, live: null }));
    });
    expect(result.current.live).toBeNull();
  });

  it("applies a delta frame and merges its events (upsert by seq, ordered)", async () => {
    const { result } = renderHook(() => useWatchLive({ token: "tok-1" }));
    const es = instances[0];

    await act(async () => {
      es.dispatch("snapshot", JSON.stringify(watchView({ seq: 9, events: [watchEvent(1, "start"), watchEvent(5, "td")] })));
    });
    expect(result.current.live?.events.map((e) => e.seq)).toEqual([1, 5]);

    await act(async () => {
      es.dispatch(
        "event",
        JSON.stringify({ ...watchView({ seq: 10, activeSide: "away" }), events: [watchEvent(5, "td"), watchEvent(10, "td")] }),
        "10",
      );
    });

    expect(result.current.live?.seq).toBe(10);
    expect(result.current.live?.activeSide).toBe("away");
    expect(result.current.live?.events.map((e) => e.seq)).toEqual([1, 5, 10]);
  });

  it("converges on a reconnect snapshot (replaces the accumulated timeline)", async () => {
    const { result } = renderHook(() => useWatchLive({ token: "tok-1" }));
    const es = instances[0];

    await act(async () => {
      es.dispatch("snapshot", JSON.stringify(watchView({ seq: 9, events: [watchEvent(1, "start")] })));
    });
    await waitFor(() => expect(result.current.live?.seq).toBe(9));

    await act(async () => {
      es.dispatch("snapshot", JSON.stringify(watchView({ seq: 12, awayScore: 1, events: [watchEvent(1, "start"), watchEvent(12, "td")] })));
    });
    await waitFor(() => expect(result.current.live?.seq).toBe(12));
    expect(result.current.live?.awayScore).toBe(1);
    expect(result.current.live?.events.map((e) => e.seq)).toEqual([1, 12]);
  });

  it("ignores 1s tick frames (clock derived locally by useLiveClock)", async () => {
    const { result } = renderHook(() => useWatchLive({ token: "tok-1" }));
    const es = instances[0];

    await act(async () => {
      es.dispatch("snapshot", JSON.stringify(watchView({ seq: 9, homeTurnMs: 1000 })));
    });
    await act(async () => {
      es.dispatch("event", JSON.stringify({ ...watchView({ seq: 10, homeTurnMs: 2000 }), kind: "tick" }));
    });

    expect(result.current.live?.seq).toBe(9);
    expect(result.current.live?.homeTurnMs).toBe(1000);
  });

  it("tracks connectivity from open/error", async () => {
    const { result } = renderHook(() => useWatchLive({ token: "tok-1" }));
    const es = instances[0];

    expect(result.current.connected).toBe(false);
    await act(async () => {
      es.onopen?.();
    });
    expect(result.current.connected).toBe(true);
    await act(async () => {
      es.onerror?.(new Error("drop"));
    });
    expect(result.current.connected).toBe(false);
  });

  it("closes the EventSource on unmount", () => {
    const { unmount } = renderHook(() => useWatchLive({ token: "tok-1" }));
    const es = instances[0];
    unmount();
    expect(es.close).toHaveBeenCalled();
  });
});
