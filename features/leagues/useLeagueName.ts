"use client";

import { useEffect, useState } from "react";
import { getLeagueDetail } from "./api";

/**
 * Resolves the display name of the league a team belongs to, or undefined when
 * the team is unassigned (`leagueId` null) so the caller can show "Sin liga".
 * Fetches `/api/leagues/[id]` on the client when a league id is present; any
 * fetch failure resolves the league to undefined (the hero falls back to
 * "Sin liga") rather than blocking the whole detail page.
 */
export function useLeagueName(leagueId: string | null | undefined): string | undefined {
  const [name, setName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!leagueId) {
      // No league → stay undefined so the caller flags "Sin liga".
      return;
    }
    let cancelled = false;
    getLeagueDetail(leagueId)
      .then((league) => {
        if (!cancelled) setName(league.name);
      })
      .catch(() => {
        // Resolution failure falls back to "Sin liga" in the hero.
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  return name;
}
