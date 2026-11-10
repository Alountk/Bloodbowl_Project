"use client";

import { useEffect, useState } from "react";
import { isCoachingStaff } from "@/features/teams/types";
import { getLeagueDetail, type LeagueStatus } from "./api";

/** The league-level access facts a match surface needs (LMR-7): the display
 * name, the owner id (to detect the owner) and the lifecycle status (to hide
 * recovery controls on a finished league). All optional until the fetch lands.
 * `teamRerolls` (MVA-2, Slice A) maps team id → purchased rerolls
 * (`coaching.rerolls`) for the Acta scoreboard line; teams whose coaching JSON
 * is not parseable stay unmapped so callers render "—". */
export interface LeagueAccess {
  name?: string;
  ownerId?: string;
  status?: LeagueStatus;
  teamRerolls?: Record<string, number>;
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
          // Runtime-defensive: older/minimal payloads may omit `teams`.
          const teams = Array.isArray(league.teams) ? league.teams : [];
          const teamRerolls: Record<string, number> = {};
          for (const team of teams) {
            if (isCoachingStaff(team.coaching)) teamRerolls[team.id] = team.coaching.rerolls;
          }
          setAccess({ name: league.name, ownerId: league.ownerId, status: league.status, teamRerolls });
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
