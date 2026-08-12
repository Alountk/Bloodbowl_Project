"use client";

import { useCallback, useEffect, useState } from "react";
import { createLeague, listLeagues, type League } from "./api";

/**
 * Loads the session user's leagues (open + own, any status) from the public
 * list endpoint. The server computes each league's `memberCount` and
 * `ownerName` in the query, so this hook performs a single fetch (no N+1
 * per-league detail calls) and exposes `create` plus `refresh` so the
 * "+ Nueva liga" modal and actions can reload the list.
 */
export function useLeagues() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial load: state updates happen in promise callbacks (not the effect
  // body) so they are not flagged by react-hooks/set-state-in-effect.
  useEffect(() => {
    let cancelled = false;
    listLeagues()
      .then((list) => {
        if (!cancelled) setLeagues(list);
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
      setLeagues(list);
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
