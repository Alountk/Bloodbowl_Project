"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  sendLiveCommand,
  type LiveCommand,
  type LiveMatchViewState,
} from "./api";

interface UseLiveMatchParams {
  leagueId: string;
  fixtureId: string;
}

export interface UseLiveMatchResult {
  /** The current live state, or null until the first snapshot arrives. */
  live: LiveMatchViewState | null;
  /** True once the EventSource is open. */
  connected: boolean;
  error: string | null;
  /** Sends a control command and returns the server's new view. */
  sendCommand: (command: LiveCommand) => Promise<LiveMatchViewState>;
}

/**
 * SSE subscriber for a live fixture (LM-8). Opens an `EventSource` to the live
 * route (same-origin cookie, no custom headers per LM-1), applies `snapshot`
 * and `state` events to a client view, and exposes `sendCommand` (POST .../live)
 * that fans out to every coach. EventSource auto-reconnects with `Last-Event-ID`
 * set from the last `state`/`event` `id:<seq>`; the server gap-replays past that
 * cursor so a new device or reconnecting coach converges (AC-8). Unmount closes
 * the stream.
 */
export function useLiveMatch({ leagueId, fixtureId }: UseLiveMatchParams): UseLiveMatchResult {
  const [live, setLive] = useState<LiveMatchViewState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Debounce/stagger the automatic reconnect (EventSource retries fast).
    const url =
      `/api/leagues/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}/live`;
    const es = new EventSource(url);

    const applyState = (data: string) => {
      try {
        const parsed = JSON.parse(data) as
          | LiveMatchViewState
          | { seq: number; live: null };
        // No live row on the fixture yet → (re)mark the session as unstarted;
        // the consent panel drives the first consent from here.
        if ("live" in parsed && parsed.live === null) {
          setLive(null);
        } else if ("activeSide" in parsed) {
          setLive(parsed as LiveMatchViewState);
        }
        setError(null);
      } catch {
        setError("Invalid live event payload");
      }
    };

    es.addEventListener("snapshot", (ev: MessageEvent) => applyState(String(ev.data)));
    es.addEventListener("state", (ev: MessageEvent) => applyState(String(ev.data)));

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
      setLive(view);
      return view;
    },
    [leagueId, fixtureId],
  );

  const result: UseLiveMatchResult = { live, connected, error, sendCommand };
  void esRef;
  return result;
}
