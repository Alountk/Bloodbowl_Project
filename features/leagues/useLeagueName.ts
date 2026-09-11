"use client";

import { useEffect, useState } from "react";
import { getLeagueDetail, type LeagueStatus } from "./api";

/** The league-level access facts a match surface needs (LMR-7): the display
 * name, the owner id (to detect the owner) and the lifecycle status (to hide
 * recovery controls on a finished league). All optional until the fetch lands. */
export interface LeagueAccess {
  name?: string;
  ownerId?: string;
  status?: LeagueStatus;
}

/**
 * Resolves a league's display name + owner id + status from
 * `/api/leagues/[id]`. Any fetch failure leaves the fields undefined (callers
 * fall back gracefully) rather than blocking the page. Mirrors the original
 * `useLeagueName` fetch, now exposing the extra access facts.
 */
export function useLeague(leagueId: string | null | undefined): LeagueAccess {
  const [access, setAccess] = useState<LeagueAccess>({});

  useEffect(() => {
    if (!leagueId) {
      // No league → stay undefined so the caller flags "Sin liga".
      return;
    }
    let cancelled = false;
    getLeagueDetail(leagueId)
      .then((league) => {
        if (!cancelled) {
          setAccess({ name: league.name, ownerId: league.ownerId, status: league.status });
        }
      })
      .catch(() => {
        // Resolution failure leaves the access fields undefined.
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  return access;
}

/**
 * Resolves the display name of the league a team belongs to, or undefined when
 * the team is unassigned (`leagueId` null) so the caller can show "Sin liga".
 * Thin wrapper over `useLeague` kept for the team-detail consumer.
 */
export function useLeagueName(leagueId: string | null | undefined): string | undefined {
  return useLeague(leagueId).name;
}
