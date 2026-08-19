"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { notFound } from "next/navigation";
import { useApp } from "@/app/providers/AppProvider";
import { getRaceById } from "@/features/teams/data/races";
import { TeamDetailView } from "@/features/teams/detail/TeamDetailView";
import { useLeagueName } from "@/features/leagues/useLeagueName";
import { getScoutedTeam, type ScoutedTeamDetail } from "@/features/leagues/api";
import {
  fetchTeamProgression,
  improvePlayer,
  renamePlayer,
  reorderRoster,
  hirePlayer,
  firePlayer,
} from "@/features/teams/api";
import type { PlayerEntry, PlayerProgressionCore } from "@/features/teams/types";
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
  const { teams, isHydrated, refreshTeams } = useApp();
  const localTeam = teams.find((t) => t.id === teamId);

  // Rival-scouting fallback state: a foreign team fetched read-only from the API.
  const [scouted, setScouted] = useState<ScoutedTeamDetail | null>(null);
  const [scoutFailed, setScoutFailed] = useState(false);

  // Owner-team progression rows keyed by rosterPlayerId, plus a failed flag so
  // the page renders the roster read-only (no Progresión controls) when the
  // fetch fails or the team has no recorded result yet.
  const [progression, setProgression] = useState<Record<string, PlayerProgressionCore> | null>(null);
  const [progressionFailed, setProgressionFailed] = useState(false);
  // Local name overrides applied after a successful rename, so the roster table
  // reflects the change without a full team refetch (the PATCH route persists
  // the name on both the Player row and the roster JSON).
  const [renamedNames, setRenamedNames] = useState<Record<string, string>>({});
  // RAU-9: the roster order committed by the owner via the reorder arrows
  // (null = the store's original order). The optimistic flip happens here
  // BEFORE the route round-trip; on failure the order reverts and the error is
  // surfaced under the table.
  const [rosterOrder, setRosterOrder] = useState<string[] | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);

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

  // Reflect a successful rename in the rendered roster without a refetch: apply
  // the latest name per rosterPlayerId over the team's roster entries. RAU-9:
  // a committed reorder sequence is applied on top (the route only persists on
  // success, so a failed reorder reverts to the previous sequence).
  const roster = resolvedTeam.roster.map((entry) => ({
    ...entry,
    name: renamedNames[entry.id] ?? entry.name,
  }));
  const rosterById = new Map(roster.map((entry) => [entry.id, entry]));
  const orderedRoster =
    rosterOrder == null
      ? roster
      : rosterOrder
          .map((id) => rosterById.get(id))
          .filter((entry): entry is PlayerEntry => entry != null);
  const teamForView: Team = { ...resolvedTeam, roster: orderedRoster };

  // Owner teams wire the Progresión controls: `onImprove` fires the improve route
  // for the targeted roster player and refreshes the progression rows so the
  // panel reflects the new PE balance. `onRename` fires the rename route and
  // applies the new name to the local roster. A failed fetch or a rival team
  // renders the roster read-only (no controls).
  const isOwner = localTeam != null;
  const onImprove = isOwner
    ? async (rosterPlayerId: string, body: ImproveBody): Promise<Record<string, unknown>> => {
        const result = await improvePlayer(teamId, rosterPlayerId, body).catch(
          // keep signature: resolve `{ error }` so the modal surfaces it verbatim
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
  const onRename = isOwner
    ? async (rosterPlayerId: string, name: string): Promise<Record<string, unknown>> => {
        const result = await renamePlayer(teamId, rosterPlayerId, name).catch(
          // keep signature: resolve `{ error }` so the modal surfaces it verbatim
          (e: Error) => ({ error: e.message }),
        );
        if (!("error" in result)) {
          setRenamedNames((prev) => ({ ...prev, [rosterPlayerId]: result.name }));
        }
        return result;
      }
    : undefined;
  // RAU-9: the reorder arrows' client. Applies the new sequence optimistically
  // (the dorsal column flips instantly); on failure the previous committed
  // sequence is restored and the server error is shown under the table.
  const onReorder = isOwner
    ? async (order: string[]): Promise<Record<string, unknown>> => {
        const prev = rosterOrder;
        setRosterOrder(order);
        setReorderError(null);
        const result = await reorderRoster(teamId, order).catch(
          // keep signature: resolve `{ error }` so the table surfaces it verbatim
          (e: Error) => ({ error: e.message }),
        );
        if ("error" in result) {
          setRosterOrder(prev);
          setReorderError(result.error);
        }
        return result;
      }
    : undefined;
  // RAU-11: the hire dialog's client. On success the team is re-listed from
  // the store so the new roster AND the dropped balance render instantly.
  const onHire = isOwner
    ? async (positionalKey: string): Promise<Record<string, unknown>> => {
        const result = await hirePlayer(teamId, positionalKey).catch(
          // keep signature: resolve `{ error }` so the dialog surfaces it verbatim
          (e: Error) => ({ error: e.message }),
        );
        if (!("error" in result)) {
          await refreshTeams();
        }
        return result;
      }
    : undefined;
  // RAU-10: the improve modal's Despedir client. On success the team is
  // re-listed so the smaller roster AND the no-refund treasury render.
  const onFire = isOwner
    ? async (rosterPlayerId: string): Promise<Record<string, unknown>> => {
        const result = await firePlayer(teamId, rosterPlayerId).catch(
          // keep signature: resolve `{ error }` so the modal surfaces it verbatim
          (e: Error) => ({ error: e.message }),
        );
        if (!("error" in result)) {
          await refreshTeams();
        }
        return result;
      }
    : undefined;

  return (
    <TeamDetailView
      team={teamForView}
      race={resolvedRace}
      leagueName={leagueName}
      progression={isOwner && !progressionFailed && progression != null ? progression : undefined}
      onImprove={onImprove}
      onRename={onRename}
      onReorder={onReorder}
      onHire={onHire}
      onFire={onFire}
      reorderError={reorderError}
    />
  );
}
