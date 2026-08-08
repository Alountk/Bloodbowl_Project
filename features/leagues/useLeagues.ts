"use client";

import { useCallback, useEffect, useState } from "react";
import { createLeague, getLeagueDetail, listLeagues, type League } from "./api";

/** A league together with its resolved member-team count for the list cards. */
export interface LeagueWithCount extends League {
  memberCount: number;
}

/**
 * Loads the session user's leagues plus each league's member count (the list
 * endpoint returns league rows, the detail endpoint includes `teams`), and
 * exposes `create` so the "+ Nueva liga" modal can POST and refresh the list.
 */
export function useLeagues() {
  const [leagues, setLeagues] = useState<LeagueWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial load: state updates happen in promise callbacks (not the effect
  // body) so they are not flagged by react-hooks/set-state-in-effect.
  useEffect(() => {
    let cancelled = false;
    listLeagues()
      .then(async (list) => {
        const withCounts = await Promise.all(
          list.map(async (league) => {
            const detail = await getLeagueDetail(league.id);
            return { ...league, memberCount: detail.teams.length };
          }),
        );
        return withCounts;
      })
      .then((withCounts) => {
        if (!cancelled) setLeagues(withCounts);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load leagues");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const list = await listLeagues();
      const withCounts = await Promise.all(
        list.map(async (league) => {
          const detail = await getLeagueDetail(league.id);
          return { ...league, memberCount: detail.teams.length };
        }),
      );
      setLeagues(withCounts);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load leagues");
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(
    async (name: string, description: string | null) => {
      const league = await createLeague(name, description);
      await refresh();
      return league;
    },
    [refresh],
  );

  return { leagues, loading, error, refresh, create };
}
