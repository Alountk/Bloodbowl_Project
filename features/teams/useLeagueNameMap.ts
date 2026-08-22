"use client";

import { useEffect, useState } from "react";
import { listLeagues } from "@/features/leagues/api";

/**
 * Loads the session user's leagues ONCE (`listLeagues`) and exposes a Map of
 * league id -> name. Powers the teams page league badges and the delete-modal
 * 409 guard without an extra detail fetch per team. When the fetch fails the
 * map stays empty and `unavailable` is set so callers can degrade (show the
 * league id instead of stumbling into a blank badge).
 */
export function useLeagueNameMap(): {
  leagueNameMap: Map<string, string>;
  unavailable: boolean;
} {
  const [leagueNameMap, setLeagueNameMap] = useState<Map<string, string>>(new Map());
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listLeagues()
      .then((leagues) => {
        if (cancelled) return;
        setLeagueNameMap(new Map(leagues.map((league) => [league.id, league.name])));
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { leagueNameMap, unavailable };
}
