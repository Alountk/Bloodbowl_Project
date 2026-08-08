"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/app/providers/AppProvider";
import { getLeagueDetail } from "@/features/leagues/api";
import { ArchiveGuardError } from "./store/ApiTeamStore";
import { getRaceById, RACES } from "./data/races";
import { summarizeRosterFromEntries } from "./roster";
import { TeamDeleteModal } from "./TeamDeleteModal";
import type { Team } from "./types";

/**
 * Rulebook-styled Spanish copy shown in the delete modal when archiving a team
 * that still belongs to a league is blocked with a 409. `{leagueName}` is the
 * resolved display name of the team's league.
 */
function guardMessageFor(leagueName: string): string {
  return `No se puede borrar este equipo — pertenece a la liga ${leagueName}. Para poder borrarlo, primero expulsalo de la liga.`;
}

export function TeamList() {
  const { teams, isHydrated, searchQuery, removeTeam } = useApp();
  const [pendingTeam, setPendingTeam] = useState<Team | null>(null);
  const [guardMessage, setGuardMessage] = useState<string | null>(null);
  const query = searchQuery.trim().toLowerCase();
  const filtered = query
    ? teams.filter((team) => {
        const race = getRaceById(team.raceId);
        return (
          team.name.toLowerCase().includes(query) ||
          race?.name.toLowerCase().includes(query)
        );
      })
    : teams;

  const openDelete = (team: Team) => {
    setGuardMessage(null);
    setPendingTeam(team);
  };

  const handleConfirm = async (id: string) => {
    // Reset any prior guard state and attempt the archive. On a 409 the store
    // rejects with an ArchiveGuardError: we surface the message and keep the
    // list state (the team is NOT removed) instead of closing the modal.
    try {
      await removeTeam(id);
      setPendingTeam(null);
      setGuardMessage(null);
    } catch (err) {
      if (err instanceof ArchiveGuardError) {
        const team = teams.find((t) => t.id === id) ?? pendingTeam;
        let name = "";
        if (team?.leagueId) {
          try {
            const league = await getLeagueDetail(team.leagueId);
            name = league.name;
          } catch {
            // League resolution failure: fall back to the league id so the
            // block is still surfaced without crashing the home page.
            name = team.leagueId;
          }
        }
        setGuardMessage(guardMessageFor(name));
        // Keep pendingTeam set so the modal stays open with the guard message.
      } else {
        // Any other error: close the dialog; the team stays in the list.
        setPendingTeam(null);
        setGuardMessage(null);
      }
    }
  };

  return (
    <section aria-labelledby="teams-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2
          id="teams-heading"
          className="border-b-[3px] border-[#d11938] pb-1.5 text-lg font-bold text-[#12225a]"
        >
          Teams
        </h2>
        <Link
          href="/teams/create"
          className="bg-[#12225a] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0f1d4d]"
        >
          Create New Team
        </Link>
      </div>
      {!isHydrated ? null : filtered.length === 0 ? (
        teams.length === 0 ? (
          <div className="border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-600">No teams yet. Create your first team.</p>
            <Link
              href="/teams/create"
              className="mt-4 inline-block bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d]"
            >
              Create New Team
            </Link>
          </div>
        ) : (
          <div className="border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-600">No teams match your search.</p>
          </div>
        )
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((team) => {
            const race = getRaceById(team.raceId);
            return (
              <li
                key={team.id}
                className="flex flex-col overflow-hidden rounded-none border border-slate-200 bg-white"
              >
                <div className="h-[6px] border-b-2 border-[#d11938] bg-[#12225a]" />
                <Link href={`/teams/${team.id}`} className="block p-4">
                  <h3 className="text-[15px] font-extrabold text-[#12225a]">{team.name}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">{race?.name ?? team.raceId}</p>
                  <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                    {summarizeRosterFromEntries(team, RACES)}
                  </p>
                </Link>
                <div className="mt-auto flex justify-end px-3 pb-3">
                  <button
                    type="button"
                    aria-label={`Delete ${team.name}`}
                    onClick={() => openDelete(team)}
                    className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-[#d11938] hover:text-[#d11938]"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
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
    </section>
  );
}
