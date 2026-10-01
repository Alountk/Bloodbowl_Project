"use client";

import { useEffect, useState } from "react";
import { getStats, type CareerStats } from "@/features/profile/api";

/**
 * Loads GET /api/me/stats for the widened stat cards (matches + W-D-L).
 * Mirrors `useDashboardInbox`: one fetch per authenticated session, cancelled
 * on unmount, errors swallowed — local mode/401s just leave the cards hidden.
 */
export function useCareerStats(authenticated: boolean): CareerStats | null {
  const [data, setData] = useState<CareerStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    // State updates happen in async callbacks so they are not flagged by
    // react-hooks/set-state-in-effect; the local branch below is the deliberate
    // synchronous exception (it clears stale stats on a true → false flip).
    const load = async () => {
      if (!authenticated) {
        setData(null);
        return;
      }
      try {
        const stats = await getStats();
        if (!cancelled) setData(stats);
      } catch {
        if (!cancelled) setData(null);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  return data;
}
