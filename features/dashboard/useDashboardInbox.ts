"use client";

import { useEffect, useState } from "react";
import type { DashboardPayload } from "@/app/api/me/dashboard/route";

export interface DashboardInboxState {
  /** Parsed payload after a successful load; null while loading or on error. */
  data: DashboardPayload | null;
  loading: boolean;
  /** Load error message; held in state only — the zones simply stay hidden. */
  error: string | null;
}

/**
 * Loads GET /api/me/dashboard (issue #305) for the home's #268 priority zones
 * (pending attention + next match): the single server-computed aggregate, so
 * the client never performs the N league-detail fetches that
 * `useUpcomingMatches` does. Mirrors `useLeagues` — one fetch, cancelled on
 * unmount, errors swallowed into state (local mode / a 401 never surface
 * "Unauthorized" chrome; the zones just do not render).
 */
export function useDashboardInbox(authenticated: boolean): DashboardInboxState {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // State updates happen in async callbacks so they are not flagged by
    // react-hooks/set-state-in-effect; the local branch below is the deliberate
    // synchronous exception.
    const load = async () => {
      // Local/anonymous mode has no API session (the endpoint 401s): skip the
      // request entirely AND drop whatever an earlier authenticated run left
      // behind — otherwise the zone would show a stale payload to an anonymous
      // visitor if `authenticated` ever flips.
      if (!authenticated) {
        setData(null);
        setError(null);
        setLoading(false);
        return;
      }
      // Honest `loading` on a false → true flip (the refetch above cleared data).
      setLoading(true);
      try {
        const res = await fetch("/api/me/dashboard");
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }
        const payload = (await res.json()) as DashboardPayload;
        if (cancelled) return;
        setData(payload);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load your dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  return { data, loading, error };
}
