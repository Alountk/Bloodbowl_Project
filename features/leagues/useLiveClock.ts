"use client";

import { useEffect, useMemo, useState } from "react";
import type { LiveMatchViewState } from "./api";

/**
 * Client-side live clock (mockup requirement): the time must pass on screen
 * every second WITHOUT an SSE round-trip. While a live match runs, a 1s
 * interval re-derives the DISPLAY values from the last server frame + the
 * client clock; the server stays the authority for everything else (LM-5:
 * `homeTurnMs`/`awayTurnMs` and `elapsed` are accumulated server-side at frame
 * time — the client only adds the in-flight drift since the frame arrived).
 */

export interface DisplayClock {
  elapsed: number;
  homeTurnMs: number;
  awayTurnMs: number;
}

/**
 * Pure: derives the DISPLAY clock from a state baseline + `now`, anchored at
 * `anchoredAt` (the epoch ms the baseline was captured). Mirrors
 * `deriveLiveClock` (lib/liveMatch.ts) segment semantics: only while
 * `status === "live"` and NOT paused the ACTIVE side advances by
 * `now - anchoredAt`; the other side stays frozen and the unified elapsed ticks
 * with the same delta. Never goes backwards (`now <= anchoredAt` → 0).
 */
export function deriveDisplayClock(
  state: LiveMatchViewState | null,
  now: number,
  anchoredAt: number,
): DisplayClock {
  if (state == null) return { elapsed: 0, homeTurnMs: 0, awayTurnMs: 0 };
  const running = state.status === "live" && !state.paused && now > anchoredAt;
  const inFlight = running ? now - anchoredAt : 0;
  const homeTurnMs = state.homeTurnMs + (state.activeSide === "home" ? inFlight : 0);
  const awayTurnMs = state.awayTurnMs + (state.activeSide === "away" ? inFlight : 0);
  return { elapsed: state.elapsed + inFlight, homeTurnMs, awayTurnMs };
}

/** Clock-relevant content signature: re-anchor only when the FRAME changes. */
function clockSignature(state: LiveMatchViewState | null): string {
  if (state == null) return "null";
  const { seq, status, half, turnNumber, activeSide, elapsed, homeTurnMs, awayTurnMs, paused } = state;
  return [seq, status, half, turnNumber, activeSide, elapsed, homeTurnMs, awayTurnMs, paused].join(":");
}

/**
 * Ticks every second while `status === "live"` (and not paused) and returns the
 * display clock derived from the latest server frame. Re-anchors the baseline
 * every time a NEW frame arrives (content change), so drift is never
 * double-counted; reference churn on the parent re-render is ignored. The
 * re-anchor uses the derived-state adjustment pattern (React-sanctioned) rather
 * than an effect. No interval is created outside live — cleanup on unmount.
 */
export function useLiveClock(state: LiveMatchViewState | null): DisplayClock {
  const [prevSignature, setPrevSignature] = useState(() => clockSignature(state));
  const [now, setNow] = useState(() => Date.now());
  const [anchorAt, setAnchorAt] = useState(() => Date.now());

  const signature = clockSignature(state);
  const running = state != null && state.status === "live" && !state.paused;

  // A NEW frame (or status flip) re-anchors the clock to the last tick instant
  // so the stale in-flight drift is never stacked on top of the frame's own
  // values (the frame itself already includes its server-side in-flight time).
  // Derived-state adjustment — React re-renders before committing, no effect.
  if (signature !== prevSignature) {
    setPrevSignature(signature);
    setAnchorAt(now);
  }

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  return useMemo<DisplayClock>(
    () => deriveDisplayClock(state, now, anchorAt),
    [state, now, anchorAt],
  );
}
