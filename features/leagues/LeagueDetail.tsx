"use client";

import Link from "next/link";
import { useState } from "react";
import { getRaceById } from "@/features/teams/data/races";
import { useLeagueDetail } from "./useLeagueDetail";

interface LeagueDetailProps {
  leagueId: string;
}

/**
 * Pattern-2 league detail: hero (name + description + member count), an assign
 * select of the user's unassigned teams, and member rows (race · players count)
 * with an "Expulsar" action. Uses `notFound` for foreign/missing leagues.
 */
export function LeagueDetail({ leagueId }: LeagueDetailProps) {
  const { league, unassigned, loading, error, notFound, assign, expel } =
    useLeagueDetail(leagueId);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  if (!loading && notFound) {
    return (
      <div className="border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">
          Liga no encontrada o sin acceso.
        </p>
        <Link
          href="/leagues"
          className="mt-4 inline-block bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d]"
        >
          Volver a mis ligas
        </Link>
      </div>
    );
  }

  if (!loading && !league) {
    return (
      <div className="border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">{error ?? "No se pudo cargar la liga."}</p>
      </div>
    );
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTeamId) return;
    setActionError(null);
    try {
      await assign(selectedTeamId);
      setSelectedTeamId("");
    } catch (e) {
      const status = (e as { status?: number }).status;
      setActionError(
        status === 409
          ? "Ese equipo ya pertenece a una liga."
          : e instanceof Error
            ? e.message
            : "No se pudo asignar el equipo.",
      );
    }
  };

  const onExpel = async (teamId: string) => {
    setActionError(null);
    try {
      await expel(teamId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "No se pudo expulsar el equipo.");
    }
  };

  const memberCount = league?.teams.length ?? 0;

  return (
    <section aria-labelledby="league-detail-heading">
      {/* Hero */}
      <header className="mb-5 bg-[#12225a] px-4 py-[22px] text-white sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1
              id="league-detail-heading"
              className="border-b-[3px] border-[#d11938] pb-1 text-2xl font-black tracking-[0.02em] md:text-[24px]"
            >
              {league?.name}
            </h1>
            <p className="mt-1 text-[13px] text-[#cbd5e1]">
              {league?.description ?? "Sin descripción"}
            </p>
            <p className="mt-1 text-[12px] text-[#cbd5e1]">
              {memberCount} {memberCount === 1 ? "equipo" : "equipos"}
            </p>
          </div>
          <Link
            href="/leagues"
            className="rounded-md border border-white/40 px-3 py-1.5 text-xs font-semibold text-white hover:border-white"
          >
            Volver
          </Link>
        </div>
      </header>

      {actionError ? (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {actionError}
        </p>
      ) : null}

      {/* Assign a team */}
      <form
        onSubmit={onSubmit}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-md border border-[#e2e8f0] bg-white p-4"
      >
        <div className="min-w-[220px] flex-1">
          <label
            htmlFor="league-team-select"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Equipos
          </label>
          <select
            id="league-team-select"
            value={selectedTeamId}
            onChange={(event) => setSelectedTeamId(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500"
          >
            <option value="">Seleccionar equipo…</option>
            {unassigned.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-[#12225a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f1d48]"
        >
          Asignar
        </button>
      </form>

      {/* Members */}
      <ul className="divide-y divide-[#e2e8f0] rounded-md border border-[#e2e8f0] bg-white">
        {league && league.teams.length === 0 ? (
          <li className="p-6 text-center text-sm text-slate-600">
            Aún no hay equipos en esta liga.
          </li>
        ) : (
          league?.teams.map((team) => {
            const race = getRaceById(team.raceId);
            const playerCount = Array.isArray(team.roster) ? team.roster.length : 0;
            return (
              <li
                key={team.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[#12225a]">{team.name}</p>
                  <p className="text-xs text-slate-500">
                    {race?.name ?? team.raceId} · {playerCount}{" "}
                    {playerCount === 1 ? "jugador" : "jugadores"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onExpel(team.id)}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-[#d11938] hover:border-[#d11938] hover:bg-[#d11938] hover:text-white"
                >
                  Expulsar
                </button>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
