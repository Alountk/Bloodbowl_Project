"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { notFound } from "next/navigation";
import { useApp } from "@/app/providers/AppProvider";
import { getRaceById } from "@/features/teams/data/races";
import { TeamDetailView } from "@/features/teams/detail/TeamDetailView";
import { useLeagueName } from "@/features/leagues/useLeagueName";
import { getScoutedTeam, type ScoutedTeamDetail } from "@/features/leagues/api";
import { fetchTeamProgression, improvePlayer } from "@/features/teams/api";
import type { PlayerProgressionCore } from "@/features/teams/types";
import type { Race, Team } from "@/features/teams/types";
import type { ImproveBody } from "@/lib/progression";

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

  // Owner-team progression rows keyed by rosterPlayerId, plus a failed flag so
  // the page renders the roster read-only (no Progresión controls) when the
  // fetch fails or the team has no recorded result yet.
  const [progression, setProgression] = useState<Record<string, PlayerProgressionCore> | null>(null);
  const [progressionFailed, setProgressionFailed] = useState(false);

  useEffect(() => {
    if (!isHydrated || scouted) return;
    let cancelled = false;
    fetchTeamProgression(teamId)
      .then((rows) => {
        if (cancelled) return;
        const byPlayer: Record<string, PlayerProgressionCore> = {};
        for (const row of rows) byPlayer[row.rosterPlayerId] = row;
        setProgression(byPlayer);
        setProgressionFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setProgression(null);
        setProgressionFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, isHydrated, scouted]);

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

  // Owner teams wire the Progresión controls: `onImprove` fires the improve route
  // for the targeted roster player and refreshes the progression rows so the
  // panel reflects the new PE balance. A failed fetch or a rival team renders the
  // roster read-only (no controls).
  const isOwner = localTeam != null;
  const onImprove = isOwner
    ? async (rosterPlayerId: string, body: ImproveBody): Promise<Record<string, unknown>> => {
        const result = await improvePlayer(teamId, rosterPlayerId, body).catch(
          // keep signature: resolve `{ error }` so the panel surfaces it verbatim
          (e: Error) => ({ error: e.message }),
        );
        if (!("error" in result)) {
          const rows = await fetchTeamProgression(teamId).catch(() => []);
          const byPlayer: Record<string, PlayerProgressionCore> = {};
          for (const row of rows) byPlayer[row.rosterPlayerId] = row;
          setProgression(byPlayer);
        }
        return result;
      }
    : undefined;

  return (
    <TeamDetailView
      team={resolvedTeam}
      race={resolvedRace}
      leagueName={leagueName}
      progression={isOwner && !progressionFailed && progression != null ? progression : undefined}
      onImprove={onImprove}
    />
  );
}
