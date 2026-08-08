"use client";

import { useCallback, useEffect, useState } from "react";
import {
  assignTeam,
  expelTeam,
  getLeagueDetail,
  listUnassignedTeams,
  type ApiTeamForAssign,
  type LeagueDetail,
} from "./api";

/**
 * Loads a league's detail (with member teams) plus the user's unassigned teams
 * for the assign select, and exposes assign/expel actions that refresh the
 * detail. When `notFound` is true the league is foreign or missing (404).
 */
export function useLeagueDetail(leagueId: string) {
  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [unassigned, setUnassigned] = useState<ApiTeamForAssign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const detail = await getLeagueDetail(leagueId);
      setLeague(detail);
      const teams = await listUnassignedTeams();
      setUnassigned(teams);
      setError(null);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) {
        setNotFound(true);
      } else {
        setError(e instanceof Error ? e.message : "Could not load league");
      }
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    let cancelled = false;
    getLeagueDetail(leagueId)
      .then(async (detail) => {
        if (cancelled) return;
        const teams = await listUnassignedTeams();
        if (cancelled) return;
        setLeague(detail);
        setUnassigned(teams);
      })
      .catch((e) => {
        if (cancelled) return;
        const status = (e as { status?: number }).status;
        if (status === 404) {
          setNotFound(true);
        } else {
          setError(e instanceof Error ? e.message : "Could not load league");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  const assign = useCallback(
    async (teamId: string) => {
      await assignTeam(leagueId, teamId);
      await refresh();
    },
    [leagueId, refresh],
  );

  const expel = useCallback(
    async (teamId: string) => {
      await expelTeam(leagueId, teamId);
      await refresh();
    },
    [leagueId, refresh],
  );

  return { league, unassigned, loading, error, notFound, refresh, assign, expel };
}
