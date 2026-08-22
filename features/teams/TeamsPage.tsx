"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/app/providers/AppProvider";
import { getRaceById } from "./data/races";
import { TeamDeleteModal } from "./TeamDeleteModal";
import { TeamSearch } from "./TeamSearch";
import { TeamCard } from "./TeamCard";
import { useLeagueNameMap } from "./useLeagueNameMap";
import { ArchiveGuardError } from "./store/ApiTeamStore";
import { useI18n } from "@/lib/i18n";
import type { Team } from "./types";

/**
 * Rulebook-styled Spanish copy for the delete-modal 409 guard, matching the
 * home-list message. The league name comes from the league map (no extra fetch).
 */
function guardMessageFor(leagueName: string): string {
  return `No se puede borrar este equipo — pertenece a la liga ${leagueName}. Para poder borrarlo, primero expulsalo de la liga.`;
}

/**
 * The dedicated Teams page grid: two sections (Sin liga / En liga), each hidden
 * when empty, filtered by the shared TeamSearch query. League names resolve from
 * a SINGLE listLeagues fetch (the map) so cards and the delete 409 guard never
 * trigger a per-team detail call. The delete modal reuses the 409 expel guard.
 */
export function TeamsPage() {
  const { t } = useI18n();
  const { teams, isHydrated, searchQuery, removeTeam } = useApp();
  const { leagueNameMap } = useLeagueNameMap();
  const [pendingTeam, setPendingTeam] = useState<Team | null>(null);
  const [guardMessage, setGuardMessage] = useState<string | null>(null);

  const query = searchQuery.trim().toLowerCase();
  const visible = query
    ? teams.filter((team) => {
        const race = getRaceById(team.raceId);
        return (
          team.name.toLowerCase().includes(query) ||
          race?.name.toLowerCase().includes(query)
        );
      })
    : teams;

  const unassigned = visible.filter((team) => team.leagueId === null);
  const assigned = visible.filter((team) => team.leagueId !== null);

  const openDelete = (team: Team) => {
    setGuardMessage(null);
    setPendingTeam(team);
  };

  const handleConfirm = async (id: string) => {
    try {
      await removeTeam(id);
      setPendingTeam(null);
      setGuardMessage(null);
    } catch (err) {
      if (err instanceof ArchiveGuardError) {
        const team = teams.find((t) => t.id === id) ?? pendingTeam;
        let name = "";
        if (team?.leagueId) {
          // League name from the map; an unresolved/stale id falls back to the
          // league id so the block is still surfaced without a crash.
          name = leagueNameMap.get(team.leagueId) ?? team.leagueId;
        }
        setGuardMessage(guardMessageFor(name));
      } else {
        setPendingTeam(null);
        setGuardMessage(null);
      }
    }
  };

  const section = (title: string, list: Team[], ariaLabel: string) => {
    if (list.length === 0) return null;
    return (
      <section aria-labelledby={`teams-${ariaLabel}-heading`}>
        <h2
          id={`teams-${ariaLabel}-heading`}
          className="mb-3 border-b-[3px] border-[#d11938] pb-1.5 text-lg font-bold text-[#12225a]"
        >
          {title}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              leagueName={team.leagueId ? leagueNameMap.get(team.leagueId) : undefined}
              onDeleteRequest={() => openDelete(team)}
            />
          ))}
        </ul>
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <TeamSearch />

      {!isHydrated ? null : visible.length === 0 ? (
        teams.length === 0 ? (
          <div className="border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-600">{t("teams.empty")}</p>
            <Link
              href="/teams/create"
              className="mt-4 inline-block bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d]"
            >
              {t("teams.createNew")}
            </Link>
          </div>
        ) : (
          <div className="border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-600">{t("teams.noMatch")}</p>
          </div>
        )
      ) : (
        <>
          {section(t("teams.unassigned"), unassigned, "unassigned")}
          {section(t("teams.inLeague"), assigned, "assigned")}
        </>
      )}

      <TeamDeleteModal
        team={pendingTeam}
        onCancel={() => {
          setPendingTeam(null);
          setGuardMessage(null);
        }}
        onConfirm={(id) => {
          void handleConfirm(id);
        }}
        guardMessage={guardMessage}
      />
    </div>
  );
}
