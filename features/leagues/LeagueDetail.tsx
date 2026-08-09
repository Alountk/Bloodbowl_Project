"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMemo, useState } from "react";
import { getRaceById } from "@/features/teams/data/races";
import { StartLeagueModal } from "./StartLeagueModal";
import { useLeagueDetail } from "./useLeagueDetail";
import type { FixtureDraft } from "./api";

interface LeagueDetailProps {
  leagueId: string;
}

/**
 * Role-aware league detail.
 *
 * The visible controls depend on the league status and the session user's
 * relationship to it:
 * - OPEN + owner (admin): member list with "Expulsar" and an "Iniciar liga"
 *   button (enabled once ≥2 members) that opens the StartLeagueModal.
 * - OPEN + non-owner member: the member's own "Desapuntarse" (self-leave).
 * - OPEN + foreign non-member: "Unirse" — a select of the user's own unassigned
 *   teams plus "Apuntarse"; if the user has no eligible team, a hint appears.
 * - STARTED (owner or member): the jornadas (home vs away per round) with an
 *   "Iniciada" badge; no join/leave/expel controls.
 * - Foreign non-member on a STARTED league: the API returns 404 and we render
 *   the not-found page.
 */
export function LeagueDetail({ leagueId }: LeagueDetailProps) {
  const { league, unassigned, loading, error, notFound, refresh, assign, expel, leave } =
    useLeagueDetail(leagueId);
  const { data: session } = useSession();
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);

  const userId = session?.user?.id;
  const isOwner = league?.ownerId === userId;
  const userMemberTeam = league?.teams.find((team) => team.userId === userId);
  const isMember = Boolean(userMemberTeam);

  if (!loading && notFound) {
    return (
      <div className="border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">Liga no encontrada o sin acceso.</p>
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

  if (!league) {
    return (
      <div className="flex min-h-[200px] items-center justify-center bg-white p-8">
        <p className="text-sm text-slate-500" role="status">
          Cargando liga…
        </p>
      </div>
    );
  }

  const memberCount = league.teams.length;
  const started = league.status === "started";

  const onJoin = async (event: React.FormEvent) => {
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
            : "No se pudo apuntar el equipo.",
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

  const onLeave = async () => {
    if (!userMemberTeam) return;
    setActionError(null);
    try {
      await leave(userMemberTeam.id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "No se pudo desapuntar.");
    }
  };

  const onStartCompleted = async () => {
    // StartLeagueModal POSTed /start; refresh so the detail shows the jornadas.
    await refresh();
  };

  return (
    <section aria-labelledby="league-detail-heading">
      {/* Hero */}
      <header className="mb-5 bg-[#12225a] px-4 py-[22px] text-white sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1
                id="league-detail-heading"
                className="border-b-[3px] border-[#d11938] pb-1 text-2xl font-black tracking-[0.02em] md:text-[24px]"
              >
                {league?.name}
              </h1>
              <span
                className={
                  started
                    ? "rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-[#12225a]"
                    : "rounded-full bg-green-600 px-2.5 py-0.5 text-[11px] font-bold text-white"
                }
              >
                {started ? "Iniciada" : "Abierta"}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-[#cbd5e1]">
              {league?.description ?? "Sin descripción"}
            </p>
            <p className="mt-1 text-[12px] text-[#cbd5e1]">
              {league?.ownerName ?? "Sin propietario"} · {memberCount}{" "}
              {memberCount === 1 ? "equipo" : "equipos"}
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

      {started ? (
        <Jornadas fixtures={league.fixtures} teams={league.teams} />
      ) : (
        <div className="space-y-6">
          {/* Anyone who is not yet a member can join with one of their own
              unassigned teams. This includes the owner, who must add their own
              team (with others) to reach the ≥2 members a season needs. */}
          {!isMember ? (
            <form onSubmit={onJoin} className="rounded-md border border-[#e2e8f0] bg-white p-4">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                Unirse
              </h3>
              {unassigned.length === 0 ? (
                <p className="text-sm text-slate-600">Crea un equipo para unirte a esta liga.</p>
              ) : (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[220px] flex-1">
                    <label htmlFor="league-team-select" className="mb-1 block text-sm font-medium text-slate-700">
                      Tu equipo
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
                    Apuntarse
                  </button>
                </div>
              )}
            </form>
          ) : null}

          {/* Member list; the owner gets expel and the season start. */}
          <MemberList teams={league.teams} onExpel={onExpel} canExpel={isOwner} />

          {isMember && !isOwner ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onLeave}
                className="rounded-md border border-[#d11938] px-4 py-2 text-sm font-semibold text-[#d11938] hover:bg-[#d11938] hover:text-white"
              >
                Desapuntarse
              </button>
            </div>
          ) : isOwner ? (
            <>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={memberCount < 2}
                  onClick={() => setStartOpen(true)}
                  className="rounded-md bg-[#12225a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f1d48] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Iniciar liga
                </button>
              </div>
              <StartLeagueModal
                open={startOpen}
                leagueId={league.id}
                teamCount={memberCount}
                onClose={() => setStartOpen(false)}
                onStarted={onStartCompleted}
              />
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** Member team list; `canExpel` toggles the owner's Expulsar button. */
function MemberList({
  teams,
  onExpel,
  canExpel,
}: {
  teams: { id: string; name: string; raceId: string; roster: unknown }[];
  onExpel: (teamId: string) => void;
  canExpel: boolean;
}) {
  return (
    <ul className="divide-y divide-[#e2e8f0] rounded-md border border-[#e2e8f0] bg-white">
      {teams.length === 0 ? (
        <li className="p-6 text-center text-sm text-slate-600">Aún no hay equipos en esta liga.</li>
      ) : (
        teams.map((team) => {
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
              {canExpel ? (
                <button
                  type="button"
                  onClick={() => onExpel(team.id)}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-[#d11938] hover:border-[#d11938] hover:bg-[#d11938] hover:text-white"
                >
                  Expulsar
                </button>
              ) : null}
            </li>
          );
        })
      )}
    </ul>
  );
}

/** Jornadas: fixtures grouped by round, rendered as home vs away matchups. */
function Jornadas({
  fixtures,
  teams,
}: {
  fixtures: FixtureDraft[];
  teams: { id: string; name: string }[];
}) {
  const teamNameById = useMemo(
    () => new Map(teams.map((team) => [team.id, team.name])),
    [teams],
  );
  const rounds = useMemo(() => {
    const grouped = new Map<number, FixtureDraft[]>();
    for (const fixture of fixtures) {
      const list = grouped.get(fixture.round) ?? [];
      list.push(fixture);
      grouped.set(fixture.round, list);
    }
    return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
  }, [fixtures]);

  if (rounds.length === 0) {
    return (
      <div className="border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">La liga se inició sin jornadas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {rounds.map(([round, matchups]) => (
        <section key={round} aria-label={`Jornada ${round}`} className="rounded-md border border-[#e2e8f0] bg-white">
          <h3 className="border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            Jornada {round}
          </h3>
          <ul className="divide-y divide-[#e2e8f0]">
            {matchups.map((fixture) => (
              <li
                key={fixture.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <span className="font-semibold text-[#12225a]">
                  {teamNameById.get(fixture.homeTeamId) ?? "Equipo"}
                </span>
                <span className="text-xs text-slate-400">vs</span>
                <span className="font-semibold text-[#12225a]">
                  {teamNameById.get(fixture.awayTeamId) ?? "Equipo"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
