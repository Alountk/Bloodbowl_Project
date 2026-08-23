import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { deriveDisplayClock, useLiveClock } from "./useLiveClock";
import type { LiveMatchViewState } from "./api";

/**
 * Client-side ticking clock (mockup requirement): the time must pass on screen
 * every second WITHOUT an SSE round-trip. `deriveDisplayClock` is the pure
 * segment-derivation (mirrors `deriveLiveClock` in lib/liveMatch.ts, client
 * edition); `useLiveClock` re-derives on a 1s interval while live and never
 * creates an interval outside live (cleanup on unmount/status change).
 */

const T0 = Date.parse("2026-08-13T10:00:00Z");

function live(overrides: Partial<LiveMatchViewState> = {}): LiveMatchViewState {
  return {
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
    paused: false,
    homeScore: 1,
    awayScore: 0,
    finishedAt: null,
    concedeProposedBy: null,
    pendingCasualty: null,
    mvpNominations: { home: null, away: null }, resolutionState: { home: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false }, away: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false } },
    ...overrides,
  };
}

describe("deriveDisplayClock (pure)", () => {
  it("advances elapsed and the ACTIVE side's turnMs by now - anchoredAt while live", () => {
    const out = deriveDisplayClock(live(), 5000, 0);
    expect(out.elapsed).toBe(7100);
    expect(out.homeTurnMs).toBe(7100);
    expect(out.awayTurnMs).toBe(0);
  });

  it("freezes the NON-active side while the active side runs", () => {
    const out = deriveDisplayClock(live({ activeSide: "away" }), 5000, 0);
    expect(out.homeTurnMs).toBe(2100);
    expect(out.awayTurnMs).toBe(5000);
    expect(out.elapsed).toBe(7100);
  });

  it("freezes the whole clock while paused", () => {
    const out = deriveDisplayClock(live({ paused: true }), 5000, 0);
    expect(out).toEqual({ elapsed: 2100, homeTurnMs: 2100, awayTurnMs: 0 });
  });

  it("freezes the whole clock pre-live (ready)", () => {
    const out = deriveDisplayClock(live({ status: "ready" }), 5000, 0);
    expect(out).toEqual({ elapsed: 2100, homeTurnMs: 2100, awayTurnMs: 0 });
  });

  it("never runs backwards when now is before the anchor", () => {
    const out = deriveDisplayClock(live(), 0, 5000);
    expect(out).toEqual({ elapsed: 2100, homeTurnMs: 2100, awayTurnMs: 0 });
  });

  it("returns zero values for a null state", () => {
    expect(deriveDisplayClock(null, 5000, 0)).toEqual({ elapsed: 0, homeTurnMs: 0, awayTurnMs: 0 });
  });
});

describe("useLiveClock (fake timers)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ticks every second while live: elapsed and the active side advance", () => {
    const { result } = renderHook(() => useLiveClock(live()));
    expect(result.current.elapsed).toBe(2100);

    act(() => vi.advanceTimersByTime(5000));

    expect(result.current.elapsed).toBe(7100);
    expect(result.current.homeTurnMs).toBe(7100);
    expect(result.current.awayTurnMs).toBe(0);
  });

  it("creates NO interval outside live (ready stays frozen)", () => {
    const { result } = renderHook(() => useLiveClock(live({ status: "ready" })));
    expect(vi.getTimerCount()).toBe(0);

    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.elapsed).toBe(2100);
  });

  it("clears the interval and freezes while paused", () => {
    const { result, rerender } = renderHook(({ state }) => useLiveClock(state), {
      initialProps: { state: live() },
    });
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.elapsed).toBe(3100);

    // The pause frame bumps the accumulator server-side then clears the pause;
    // the client freezes at exactly the frame's values (no interval).
    vi.setSystemTime(T0 + 2000);
    rerender({ state: live({ seq: 7, paused: true, elapsed: 3200, homeTurnMs: 3200 }) });
    expect(vi.getTimerCount()).toBe(0);

    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.elapsed).toBe(3200);
  });

  it("re-anchors on a NEW server frame without double-counting drift", () => {
    const { result, rerender } = renderHook(({ state }) => useLiveClock(state), {
      initialProps: { state: live({ seq: 6, elapsed: 1000, homeTurnMs: 1000 }) },
    });
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.elapsed).toBe(4000);

    // A fresh frame arrives exactly at a tick boundary (T0+3000) carrying the
    // server's own derived values (its in-flight time already included).
    vi.setSystemTime(T0 + 3000);
    rerender({ state: live({ seq: 7, elapsed: 4000, homeTurnMs: 4000 }) });
    // Shows the frame's values — NOT the stale 3000ms drift stacked on top
    // (4000 + 3000 = 7000 would be the double-count bug).
    expect(result.current.elapsed).toBe(4000);

    act(() => vi.advanceTimersByTime(2000));
    // Only the NEW drift since the re-anchor accumulates.
    expect(result.current.elapsed).toBe(6000);
  });

  it("does NOT re-anchor when a re-render passes an identical state (no drift restart)", () => {
    const state = live();
    const { result, rerender } = renderHook(({ s }) => useLiveClock(s), {
      initialProps: { s: state },
    });
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.elapsed).toBe(4100);

    rerender({ s: { ...state } });
    expect(result.current.elapsed).toBe(4100);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.elapsed).toBe(5100);
  });

  it("clears the interval on unmount", () => {
    const { unmount } = renderHook(() => useLiveClock(live()));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
