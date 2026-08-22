"use client";

import { useEffect, useState } from "react";
import { getLeagueDetail, listLeagues, type LeagueDetail } from "@/features/leagues/api";
import {
  selectUpcomingFixtures,
  type UpcomingFixture,
} from "./selectUpcomingFixtures";

/**
 * Loads the session user's upcoming fixtures (MP-4): starts from the league
 * list, keeps only the `started` leagues the user owns or is a member of,
 * fetches each of their details in parallel (`Promise.all`), and derives the
 * user's pending/scheduled fixtures via the pure `selectUpcomingFixtures`
 * selector. When the league APIs are unavailable (local/anonymous mode, 401)
 * the hook surfaces `unavailable` so the page renders the Dashboard-style
 * empty state instead of failing.
 */
export interface UseUpcomingMatchesResult {
  fixtures: UpcomingFixture[];
  loading: boolean;
  unavailable: boolean;
}

export function useUpcomingMatches(
  userId: string | null | undefined,
): UseUpcomingMatchesResult {
  const [fixtures, setFixtures] = useState<UpcomingFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Anonymous/local mode: no userId → no session → unavailable (MP-4).
    // All state updates happen in promise callbacks (never the effect body) so
    // they are not flagged by react-hooks/set-state-in-effect.
    const load = async () => {
      if (!userId) {
        setFixtures([]);
        setUnavailable(true);
        setLoading(false);
        return;
      }

      try {
        const leagues = await listLeagues();
        const scoped = leagues.filter(
          (league) =>
            league.status === "started" &&
            (league.isMember || league.ownerId === userId),
        );
        // Load every started member league's detail in parallel (bounded: only
        // the user's own leagues — design D4).
        const details = new Map<string, LeagueDetail>();
        if (scoped.length > 0) {
          const resolved = await Promise.all(scoped.map((league) => getLeagueDetail(league.id)));
          for (const detail of resolved) details.set(detail.id, detail);
        }
        if (cancelled) return;
        const next = selectUpcomingFixtures({ userId, leagues, details });
        setFixtures(next);
        setUnavailable(false);
      } catch {
        if (cancelled) return;
        setFixtures([]);
        setUnavailable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { fixtures, loading, unavailable };
}
