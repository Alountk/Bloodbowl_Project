"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { CreateLeagueModal } from "./CreateLeagueModal";
import { useLeagues } from "./useLeagues";
import type { League } from "./api";

/** Status badge copy + palette, keyed off the server-supplied league status. */
function StatusBadge({ status }: { status: League["status"] }) {
  const { t } = useI18n();
  if (status === "started") {
    return (
      <span className="rounded-full bg-[#12225a] px-2.5 py-0.5 text-[11px] font-bold text-white">
        {t("leagues.status.started")}
      </span>
    );
  }
  if (status === "finished") {
    return (
      <span className="rounded-full bg-[#fbbf24] px-2.5 py-0.5 text-[11px] font-bold text-[#12225a]">
        🏆 {t("leagues.status.finished")}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-green-700 px-2.5 py-0.5 text-[11px] font-bold text-white">
      {t("leagues.status.open")}
    </span>
  );
}

/**
 * Rulebook card for a single league: name, description, status badge ("Abierta"
 * green / "Iniciada" navy), owner name, member count (server-computed, no N+1)
 * and a "Ver" link into the detail page.
 */
function LeagueCard({ league }: { league: League }) {
  const { t } = useI18n();
  return (
    <li className="flex flex-col overflow-hidden rounded-none border border-slate-200 bg-white">
      <div className="h-[6px] border-b-2 border-[#d11938] bg-[#12225a]" />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[15px] font-extrabold text-[#12225a]">{league.name}</h3>
          <StatusBadge status={league.status} />
        </div>
        {league.description ? (
          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{league.description}</p>
        ) : (
          <p className="mt-1 text-xs text-slate-400">{t("leagues.noDescription")}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-2 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
          <span>{league.ownerName ?? t("leagues.noOwner")}</span>
          <span aria-hidden="true">·</span>
          <span>
            {t(league.memberCount === 1 ? "leagues.membersOne" : "leagues.membersMany", {
              count: league.memberCount,
            })}
          </span>
        </div>
        <div className="mt-auto flex justify-end pt-3">
          <Link
            href={`/leagues/${league.id}`}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-[#12225a] hover:text-[#12225a]"
          >
            {t("leagues.view")}
          </Link>
        </div>
      </div>
    </li>
  );
}

/**
 * Public leagues list: "Mis Ligas" (the session user's own leagues OR leagues
 * where they have a member team, any status — so started member leagues stay
 * reachable) plus "Ligas abiertas" (every foreign OPEN league the user is NOT
 * a member of). Both sets come from the single public list endpoint — the
 * server supplies owner name, member count and the `isMember` flag, so there
 * are no per-card detail fetches. The create modal lets the admin create their
 * own league.
 */
export function LeagueList() {
  const { leagues, loading, error, refresh } = useLeagues();
  const { data: session } = useSession();
  const { t } = useI18n();
  const [modalOpen, setModalOpen] = useState(false);

  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const userId = session?.user?.id;
  // Owned OR joined (any status): a started league a member plays in must appear
  // here — otherwise it would be unreachable once open leagues are hidden.
  const myLeagues = leagues.filter(
    (league) => league.ownerId === userId || league.isMember,
  );
  const openLeagues = leagues.filter(
    (league) =>
      league.status === "open" &&
      league.ownerId !== userId &&
      !league.isMember,
  );

  return (
    <section aria-labelledby="leagues-heading">
      {/* Hero */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 bg-[#12225a] px-4 py-[22px] text-white sm:px-6">
        <div className="min-w-0">
          <h1
            id="leagues-heading"
            className="border-b-[3px] border-[#d11938] pb-1 text-2xl font-black tracking-[0.02em] md:text-[24px]"
          >
            {t("leagues.myLeagues")}
          </h1>
          <p className="mt-1 text-[13px] text-[#cbd5e1]">{t("leagues.heroSubtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded-md border-2 border-[#d11938] bg-[#d11938] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#b3122f]"
        >
          {t("leagues.newLeague")}
        </button>
      </header>

      {loading ? null : error ? (
        <div className="border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : leagues.length === 0 ? (
        <div className="border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">{t("leagues.empty")}</p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-4 inline-block bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d]"
          >
            {t("leagues.newLeague")}
          </button>
        </div>
      ) : (
        <>
          <section aria-labelledby="my-leagues-heading" className="mb-8">
            <h2
              id="my-leagues-heading"
              className="mb-3 border-b border-slate-200 pb-1 text-sm font-bold uppercase tracking-wide text-slate-500"
            >
              {t("leagues.myLeagues")}
            </h2>
            {myLeagues.length === 0 ? (
              <p className="border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
                {t("leagues.myEmpty")}
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {myLeagues.map((league) => (
                  <LeagueCard key={league.id} league={league} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="open-leagues-heading">
            <h2
              id="open-leagues-heading"
              className="mb-3 border-b border-slate-200 pb-1 text-sm font-bold uppercase tracking-wide text-slate-500"
            >
              {t("leagues.openLeagues")}
            </h2>
            {openLeagues.length === 0 ? (
              <p className="border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
                {t("leagues.openEmpty")}
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {openLeagues.map((league) => (
                  <LeagueCard key={league.id} league={league} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <CreateLeagueModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleRefresh}
      />
    </section>
  );
}
