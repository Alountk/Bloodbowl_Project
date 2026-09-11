"use client";

import { useEffect, useState } from "react";
import type { WatchEvent, WatchLiveView } from "@/lib/watchAccess";

interface UseWatchLiveParams {
  /** The fixture's public share token (the path segment of `/watch/[token]`). */
  token: string;
}

export interface UseWatchLiveResult {
  /** The current reduced live view, or null until the first snapshot arrives. */
  live: WatchLiveView | null;
  /** True once the EventSource is open. */
  connected: boolean;
  error: string | null;
}

/** Upper bound on the client-side timeline so a long match cannot grow it unbounded. */
const MAX_EVENTS = 200;

/** A reduced hub frame; the server keeps the tick/ack `kind` discriminator. */
type WatchFrame = WatchLiveView & { kind?: string };

/** Merges a frame's delta events into the accumulated timeline (upsert by seq). */
function upsertEvents(existing: WatchEvent[], incoming: WatchEvent[]): WatchEvent[] {
  if (incoming.length === 0) return existing;
  const bySeq = new Map<number, WatchEvent>(existing.map((e) => [e.seq, e]));
  for (const event of incoming) bySeq.set(event.seq, event);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq).slice(-MAX_EVENTS);
}

function parseFrame(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * SSE subscriber for the PUBLIC guest watch page (MSL-5). Opens an `EventSource`
 * to `/api/watch/[token]/live` (no session, no custom headers), applies the
 * `snapshot` (authoritative, REPLACES the timeline) and the `event`/`state`
 * hub frames (merge their delta events), and skips the 1s info ticks — the guest
 * clock is derived locally by `useLiveClock`. The server already reduced every
 * frame to the public whitelist, so the hook never sees private fields.
 * EventSource auto-reconnects and re-applies the snapshot, so a reconnect
 * converges. Unmount closes the stream.
 */
export function useWatchLive({ token }: UseWatchLiveParams): UseWatchLiveResult {
  const [live, setLive] = useState<WatchLiveView | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = `/api/watch/${encodeURIComponent(token)}/live`;
    const es = new EventSource(url);

    const applySnapshot = (data: string) => {
      const parsed = parseFrame(data);
      if (parsed == null || typeof parsed !== "object") {
        setError("Invalid live event payload");
        return;
      }
      const frame = parsed as Record<string, unknown>;
      // No live row on the fixture yet → (re)mark the view as unstarted.
      if ("live" in frame && frame.live === null) {
        setLive(null);
        setError(null);
        return;
      }
      if (typeof frame.activeSide !== "string") return;
      const view = parsed as WatchFrame;
      // The snapshot is the authoritative persisted timeline → replaces.
      setLive({ ...view, events: view.events ?? [] });
      setError(null);
    };

    const applyFrame = (data: string) => {
      const parsed = parseFrame(data);
      if (parsed == null || typeof parsed !== "object") {
        setError("Invalid live event payload");
        return;
      }
      const frame = parsed as Record<string, unknown>;
      if ("live" in frame && frame.live === null) {
        setLive(null);
        setError(null);
        return;
      }
      if (typeof frame.activeSide !== "string") return;
      // The 1s info ticks are derived locally by useLiveClock — skip them.
      if (frame.kind === "tick") return;
      const view = parsed as WatchFrame;
      setLive((prev) => ({
        ...view,
        // Hub frames carry only the DELTA events of their transition; merge so
        // a `state` frame never wipes the accumulated timeline.
        events: prev != null ? upsertEvents(prev.events, view.events ?? []) : (view.events ?? []),
      }));
      setError(null);
    };

    es.addEventListener("snapshot", (ev: MessageEvent) => applySnapshot(String(ev.data)));
    es.addEventListener("event", (ev: MessageEvent) => applyFrame(String(ev.data)));
    es.addEventListener("state", (ev: MessageEvent) => applyFrame(String(ev.data)));

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };
    es.onerror = () => {
      // EventSource reconnects automatically; surface connectivity once.
      setConnected(false);
    };

    return () => {
      es.close();
    };
  }, [token]);

  return { live, connected, error };
}
