"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  sendLiveCommand,
  type LiveCommand,
  type LiveMatchEventDto,
  type LiveMatchView,
  type LiveMatchViewState,
} from "./api";

interface UseLiveMatchParams {
  leagueId: string;
  fixtureId: string;
}

export interface UseLiveMatchResult {
  /** The current live view (state + accumulated event timeline), or null until the first snapshot arrives. */
  live: LiveMatchView | null;
  /** True once the EventSource is open. */
  connected: boolean;
  error: string | null;
  /** Sends a control command and returns the server's new view. */
  sendCommand: (command: LiveCommand) => Promise<LiveMatchViewState>;
}

/** Upper bound on the client-side timeline so a long match cannot grow it unbounded. */
const MAX_EVENTS = 200;

/** A server/hub frame: the full view plus the delta events it carries (LM-8). */
type LiveFrame = LiveMatchViewState & { events?: LiveMatchEventDto[]; kind?: string };

/** Merges a frame's delta events into the accumulated timeline (upsert by seq). */
function upsertEvents(existing: LiveMatchEventDto[], incoming: LiveMatchEventDto[]): LiveMatchEventDto[] {
  if (incoming.length === 0) return existing;
  const bySeq = new Map<number, LiveMatchEventDto>(existing.map((e) => [e.seq, e]));
  for (const event of incoming) bySeq.set(event.seq, event);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq).slice(-MAX_EVENTS);
}

function parseFrame(data: string): LiveFrame | { seq: number; live: null } | null {
  try {
    return JSON.parse(data) as LiveFrame | { seq: number; live: null };
  } catch {
    return null;
  }
}

/**
 * SSE subscriber for a live fixture (LM-8). Opens an `EventSource` to the live
 * route (same-origin cookie, no custom headers per LM-1), applies `snapshot`,
 * `state` and `event` frames to a client view, and exposes `sendCommand` (POST
 * .../live) that fans out to every coach. EventSource auto-reconnects with
 * `Last-Event-ID` set from the last `state`/`event` `id:<seq>`; the server
 * gap-replays past that cursor so a new device or reconnecting coach converges
 * (AC-8). Frame semantics:
 * - `snapshot`: authoritative full state + the persisted timeline (REPLACES).
 * - `state`/`event`: hub fan-out — the new view plus that transition's DELTA
 *   events, appended to the accumulated timeline (never wiped). The 1s info
 *   tick frames are skipped (the client clock derives locally, LM-5).
 * Unmount closes the stream.
 */
export function useLiveMatch({ leagueId, fixtureId }: UseLiveMatchParams): UseLiveMatchResult {
  const [live, setLive] = useState<LiveMatchView | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Debounce/stagger the automatic reconnect (EventSource retries fast).
    const url =
      `/api/leagues/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}/live`;
    const es = new EventSource(url);

    const applySnapshot = (data: string) => {
      const parsed = parseFrame(data);
      if (parsed == null) {
        setError("Invalid live event payload");
        return;
      }
      // No live row on the fixture yet → (re)mark the session as unstarted;
      // the consent panel drives the first consent from here.
      if ("live" in parsed && parsed.live === null) {
        setLive(null);
      } else if ("activeSide" in parsed) {
        const frame = parsed as LiveFrame;
        setLive((prev) => ({
          ...frame,
          // The snapshot is the authoritative persisted timeline → replaces.
          events: frame.events ?? (prev != null ? prev.events : []),
        }));
      }
      setError(null);
    };

    const applyFrame = (data: string) => {
      const parsed = parseFrame(data);
      if (parsed == null) {
        setError("Invalid live event payload");
        return;
      }
      if ("live" in parsed && parsed.live === null) {
        setLive(null);
        return;
      }
      if (!("activeSide" in parsed)) return;
      const frame = parsed as LiveFrame;
      // The 1s info ticks are derived locally by useLiveClock — skip them.
      if (frame.kind === "tick") return;
      setLive((prev) => ({
        ...frame,
        // Hub frames carry only the DELTA events of their transition; merge so
        // a `state` frame never wipes the accumulated timeline.
        events: prev != null ? upsertEvents(prev.events, frame.events ?? []) : (frame.events ?? []),
      }));
      setError(null);
    };

    es.addEventListener("snapshot", (ev: MessageEvent) => applySnapshot(String(ev.data)));
    es.addEventListener("state", (ev: MessageEvent) => applyFrame(String(ev.data)));
    es.addEventListener("event", (ev: MessageEvent) => applyFrame(String(ev.data)));

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };
    es.onerror = () => {
      // EventSource reconnects automatically; surface connectivity once.
      setConnected(false);
    };

    esRef.current = es;

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [leagueId, fixtureId]);

  const sendCommand = useCallback(
    async (command: LiveCommand) => {
      const view = await sendLiveCommand(leagueId, fixtureId, command);
      // The server's hub will push the authoritative `state`; optimistically
      // reflect the returned view so the issuing coach sees it immediately.
      // The view has no events — keep the accumulated timeline.
      setLive((prev) => ({ ...view, events: prev != null ? prev.events : [] }));
      return view;
    },
    [leagueId, fixtureId],
  );

  const result: UseLiveMatchResult = { live, connected, error, sendCommand };
  void esRef;
  return result;
}
