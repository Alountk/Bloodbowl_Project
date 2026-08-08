"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { CreateLeagueModal } from "./CreateLeagueModal";
import { useLeagues } from "./useLeagues";

/** Pattern-2 leagues list: hero + a grid of navy/red cards. */
export function LeagueList() {
  const { leagues, loading, error, refresh } = useLeagues();
  const [modalOpen, setModalOpen] = useState(false);

  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  return (
    <section aria-labelledby="leagues-heading">
      {/* Hero */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 bg-[#12225a] px-4 py-[22px] text-white sm:px-6">
        <div className="min-w-0">
          <h1
            id="leagues-heading"
            className="border-b-[3px] border-[#d11938] pb-1 text-2xl font-black tracking-[0.02em] md:text-[24px]"
          >
            Mis Ligas
          </h1>
          <p className="mt-1 text-[13px] text-[#cbd5e1]">Agrupa tus equipos en ligas.</p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded-md border-2 border-[#d11938] bg-[#d11938] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#b3122f]"
        >
          + Nueva liga
        </button>
      </header>

      {loading ? null : error ? (
        <div className="border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : leagues.length === 0 ? (
        <div className="border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">No hay ligas todavía. Crea la primera.</p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-4 inline-block bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d]"
          >
            + Nueva liga
          </button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {leagues.map((league) => (
            <li
              key={league.id}
              className="flex flex-col overflow-hidden rounded-none border border-slate-200 bg-white"
            >
              {/* Navy top band with red border */}
              <div className="h-[6px] border-b-2 border-[#d11938] bg-[#12225a]" />
              <div className="flex flex-1 flex-col p-4">
                <h3 className="text-[15px] font-extrabold text-[#12225a]">{league.name}</h3>
                {league.description ? (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{league.description}</p>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">Sin descripción</p>
                )}
                <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                  {league.memberCount} {league.memberCount === 1 ? "equipo" : "equipos"}
                </p>
                <div className="mt-auto flex justify-end pt-3">
                  <Link
                    href={`/leagues/${league.id}`}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-[#12225a] hover:text-[#12225a]"
                  >
                    Ver
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateLeagueModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleRefresh}
      />
    </section>
  );
}
