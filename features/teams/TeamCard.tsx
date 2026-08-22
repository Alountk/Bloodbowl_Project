"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TeamEmblem } from "@/features/leagues/TeamEmblem";
import { getRaceById, RACES } from "./data/races";
import { fetchTeamProgression } from "./api";
import {
  computeCoachingCost,
  computeRosterCostFromPlayers,
  computeSpendableBalance,
  countReadyToImprove,
  summarizeRosterFromEntries,
} from "./roster";
import { formatRulebookCost } from "./format";
import type { Locale } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE } from "@/lib/i18n/dictionaries";
import type { PlayerProgressionCore, Team, Race } from "./types";

/**
 * One team in the dedicated teams page grid. Owns its progression fetch (a
 * single `GET /api/teams/[id]/progression` call) which feeds BOTH the
 * ready-to-improve hint ("X listos para mejorar", count only) and the valueBonus
 * side of the CTV. CTV = roster cost + coaching cost + Σ progression valueBonus,
 * matching the per-player value convention in the detail roster.
 *
 * The league badge is render-only from the caller-resolved league name map: it
 * is hidden when the league cannot be resolved (null/stale id) rather than
 * forcing another fetch. The delete icon is a pure signal (`onDeleteRequest`)
 * — the parent owns the TeamDeleteModal + 409 guard.
 */
export function TeamCard({
  team,
  leagueName,
  onDeleteRequest,
  locale = DEFAULT_LOCALE,
}: {
  team: Team;
  leagueName: string | undefined;
  onDeleteRequest: () => void;
  locale?: Locale;
}) {
  const [progression, setProgression] = useState<PlayerProgressionCore[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchTeamProgression(team.id)
      .then((rows) => {
        if (!cancelled) setProgression(rows);
      })
      .catch(() => {
        // A failed progression fetch degrades to no hint and no valueBonus.
      });
    return () => {
      cancelled = true;
    };
  }, [team.id]);

  const catalogRace = getRaceById(team.raceId);
  // Race-not-in-catalog fallback (same convention as TeamDetailView): an unknown
  // race id renders as its raw id with zero costs so the card never crashes.
  const race: Race = catalogRace ?? {
    id: team.raceId,
    name: team.raceId,
    rerollCost: 0,
    positionals: [],
  };
  const rosterCost = computeRosterCostFromPlayers(race, team.roster);
  const coachingCost = computeCoachingCost(race, team.coaching);
  const valueBonus = progression.reduce((total, p) => total + p.valueBonus, 0);
  const ctv = rosterCost + coachingCost + valueBonus;
  const treasury = computeSpendableBalance(team, race);
  const readyCount = countReadyToImprove(progression);
  const hint = readyCount === 1 ? "1 listo para mejorar" : `${readyCount} listos para mejorar`;

  return (
    <li className="flex flex-col overflow-hidden border border-slate-200 bg-white">
      <div className="h-[6px] border-b-2 border-[#d11938] bg-[#12225a]" />
      <Link href={`/teams/${team.id}`} className="flex flex-col gap-2 p-4">
        <div className="flex items-center gap-3">
          <span aria-hidden="false">
            <TeamEmblem teamId={team.id} name={team.name} size="md" />
          </span>
          <div className="flex-1">
            <h3 className="text-[15px] font-extrabold text-[#12225a]">{team.name}</h3>
            <p className="text-xs text-slate-500">{race?.name ?? team.raceId}</p>
          </div>
        </div>

        {leagueName ? (
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[#1f3a7a] px-2.5 py-0.5 text-[11px] font-bold text-white">
            {leagueName}
          </span>
        ) : null}

        {readyCount > 0 ? (
          <span className="inline-flex w-fit items-center rounded-full border border-[#d11938] bg-[#d11938]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#d11938]">
            {hint}
          </span>
        ) : null}

        <div className="flex items-center gap-3 text-[12px] text-slate-700">
          <span>
            Valor{" "}
            <b data-testid="team-ctv" className="text-[#12225a]">
              {formatRulebookCost(ctv)}
            </b>
          </span>
          <span>
            Tesorería:{" "}
            <b data-testid="team-treasury" className="text-[#12225a]">
              {formatRulebookCost(treasury)}
            </b>
          </span>
        </div>

        <p className="border-t border-slate-100 pt-2 text-[11px] text-slate-400">
          {summarizeRosterFromEntries(team, RACES, locale)}
        </p>
      </Link>
      <div className="mt-auto flex justify-end px-3 pb-3">
        <button
          type="button"
          aria-label={`Eliminar ${team.name}`}
          onClick={onDeleteRequest}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-[#d11938] hover:text-[#d11938]"
        >
          Eliminar
        </button>
      </div>
    </li>
  );
}
