"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { notFound } from "next/navigation";
import { useApp } from "@/app/providers/AppProvider";
import { getRaceById } from "@/features/teams/data/races";
import { TeamDetailView } from "@/features/teams/detail/TeamDetailView";
import { useLeagueName } from "@/features/leagues/useLeagueName";
import { getScoutedTeam, type ScoutedTeamDetail } from "@/features/leagues/api";
import type { Race, Team } from "@/features/teams/types";

interface TeamDetailPageProps {
  params: Promise<{ teamId: string }>;
}

/**
 * Resolves the session user's own team from the client store when present; for
 * a RIVAL team (not in the store) it fetches the read-only scouting detail via
 * `GET /api/teams/[id]` and renders it through the same (read-only)
 * TeamDetailView. A 404 from scouting maps to `notFound()`. An owned team in
 * the store never triggers a scouting fetch.
 */
export default function TeamDetailPage({ params }: TeamDetailPageProps) {
  const { teamId } = use(params);
  const { teams, isHydrated } = useApp();
  const localTeam = teams.find((t) => t.id === teamId);

  // Rival-scouting fallback state: a foreign team fetched read-only from the API.
  const [scouted, setScouted] = useState<ScoutedTeamDetail | null>(null);
  const [scoutFailed, setScoutFailed] = useState(false);

  useEffect(() => {
    if (!isHydrated || localTeam) return;
    let cancelled = false;
    getScoutedTeam(teamId)
      .then((detail) => {
        if (cancelled) return;
        setScouted(detail);
        setScoutFailed(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setScoutFailed(true);
        const status = (e as { status?: number }).status;
        if (status === 404) {
          notFound();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, isHydrated, localTeam]);

  // A rival's scouted detail conforms to the Team read shape (the API returns the
  // same roster/coaching fields); the `unknown` roster is narrowed via the cast.
  const resolvedTeam: Team | null = localTeam ?? (scouted as unknown as Team);

  const leagueName = useLeagueName(resolvedTeam?.leagueId);

  if (!isHydrated) {
    return (
      <div
        data-testid="team-detail-skeleton"
        aria-label="Loading team"
        role="status"
      />
    );
  }

  if (!localTeam && !resolvedTeam) {
    // While the scouting fetch is in flight, show the skeleton; on failure
    // (404 or otherwise) fall through to notFound, like the owner-only default.
    if (!scoutFailed && scouted === null) {
      return (
        <div
          data-testid="team-detail-skeleton"
          aria-label="Loading team"
          role="status"
        />
      );
    }
    notFound();
    // notFound() throws; this return is unreachable but satisfies TypeScript.
    return null;
  }

  // Resolve the race from catalog, or construct a FALLBACK_RACE so TeamDetailView
  // always gets a valid Race shape. Fallback: name = raw raceId (spec requirement).
  const resolvedRace: Race = getRaceById(resolvedTeam.raceId) ?? {
    id: resolvedTeam.raceId,
    name: resolvedTeam.raceId,
    rerollCost: 0,
    positionals: [],
  };

  return <TeamDetailView team={resolvedTeam} race={resolvedRace} leagueName={leagueName} />;
}
