import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { WatchMatchView } from "./WatchMatchView";
import type { WatchLiveView, WatchMatchDto } from "@/lib/watchAccess";

/**
 * Public guest watch page tests (MSL-6). The component consumes the reduced
 * `GET /api/watch/[token]` DTO and the `useWatchLive` stream; it must render the
 * shared score/clock/timeline with NO member chrome and NO controls (the forced
 * `viewerSide:null` gates every affordance), and collapse to the SAME generic
 * unavailable copy as the server on a 404.
 */

/** A controllable EventSource so the guest stream can push frames in tests. */
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

const instances: FakeEventSource[] = [];

function stubEventSource() {
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
}

/** A reduced guest live view (no private fields, `viewerSide` forced null). */
function watchView(overrides: Partial<WatchLiveView> = {}): WatchLiveView {
  return {
    seq: 5,
    status: "live",
    half: 1,
    turnNumber: 2,
    activeSide: "home",
    homeScore: 1,
    awayScore: 0,
    startedAt: 1000,
    finishedAt: null,
    elapsed: 60_000,
    homeTurnMs: 30_000,
    awayTurnMs: 30_000,
    paused: false,
    viewerSide: null,
    events: [
      { seq: 1, kind: "start", side: null, playerRosterId: null, half: 1, turnNumber: 1, payload: {}, at: 1000 },
      { seq: 2, kind: "td", side: "home", playerRosterId: null, half: 1, turnNumber: 1, payload: {}, at: 2000 },
    ],
    ...overrides,
  };
}

/** The reduced `WatchMatchDto` served by the public GET. */
function watchDto(overrides: Partial<WatchMatchDto> = {}): WatchMatchDto {
  return {
    fixture: {
      id: "f1",
      round: 1,
      status: "scheduled",
      scheduledAt: null,
      homeScore: null,
      awayScore: null,
      winnerId: null,
    },
    homeTeam: { id: "t1", name: "Reavers", raceId: "human", emblem: null },
    awayTeam: { id: "t2", name: "Orcs", raceId: "orc", emblem: null },
    live: watchView(),
    summary: null,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  stubEventSource();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("WatchMatchView — public read-only match", () => {
  it("renders the shared teams, score and clock from the initial reduced GET", async () => {
    fetchMock.mockResolvedValue(jsonResponse(watchDto()));

    render(<WatchMatchView token="tok-1" />);

    await waitFor(() => expect(screen.getByText("Reavers")).toBeTruthy());
    expect(screen.getByText("Orcs")).toBeTruthy();
    expect(screen.getByTestId("watch-score-home").textContent).toBe("1");
    expect(screen.getByTestId("watch-score-away").textContent).toBe("0");
    // 60_000 ms → 0:01:00.
    expect(screen.getByTestId("watch-clock").textContent).toBe("0:01:00");
  });

  it("renders the reduced timeline/feed with no member controls (viewerSide forced null)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(watchDto()));

    render(<WatchMatchView token="tok-1" />);

    await waitFor(() => expect(screen.getAllByTestId("live-event-row").length).toBe(2));
    expect(screen.getByTestId("match-timeline")).toBeTruthy();
    // The guest has no share/begin/concede/ack affordances: zero buttons.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText("Compartir")).toBeNull();
  });

  it("shows the SAME generic unavailable copy as the server on a 404", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "Este link ya no está disponible" }, 404),
    );

    render(<WatchMatchView token="gone" />);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Este link ya no está disponible"),
    );
    expect(screen.queryByTestId("watch-header")).toBeNull();
  });

  it("shows the finished badge for a finished live view (no live badge)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        watchDto({
          live: watchView({ status: "finished", finishedAt: 90_000, elapsed: 90_000 }),
          summary: { homeScore: 1, awayScore: 0, winnerSide: "home" },
        }),
      ),
    );

    render(<WatchMatchView token="tok-1" />);

    await waitFor(() => expect(screen.getByText("Finalizado")).toBeTruthy());
    expect(screen.queryByText("EN VIVO")).toBeNull();
    expect(screen.getByTestId("watch-clock").textContent).toBe("0:01:30");
  });

  it("applies a live SSE frame over the initial DTO (score updates)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(watchDto()));

    render(<WatchMatchView token="tok-1" />);

    await waitFor(() => expect(screen.getByTestId("watch-score-home").textContent).toBe("1"));
    await waitFor(() => expect(instances.length).toBeGreaterThan(0));

    act(() => {
      instances[0].dispatch(
        "snapshot",
        JSON.stringify(watchView({ seq: 8, homeScore: 3, awayScore: 2 })),
      );
    });

    await waitFor(() => expect(screen.getByTestId("watch-score-home").textContent).toBe("3"));
    expect(screen.getByTestId("watch-score-away").textContent).toBe("2");
  });
});
