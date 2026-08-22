"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApp } from "@/app/providers/AppProvider";
import { useI18n } from "@/lib/i18n";
import { LeagueCard } from "@/features/leagues/LeagueList";
import { useLeagues } from "@/features/leagues/useLeagues";
import { TeamList } from "@/features/teams/TeamList";

interface DashboardProps {
  /** True when backed by an authenticated session (API store + real leagues). */
  authenticated: boolean;
  /** The session user's display name (or email); null in local/anonymous mode. */
  userName: string | null;
}

/**
 * Classic home dashboard for logged-in users: welcome header, stat cards
 * (teams + my leagues), quick actions, and the two lists — teams (reusing
 * `TeamList` unchanged) and my leagues (reusing the league card). Home-chrome
 * copy (welcome/stats/quick actions) is English per the repo convention; the
 * embedded teams/leagues sections keep their own (Spanish) copy.
 */
export function Dashboard({ authenticated, userName }: DashboardProps) {
  const { teams } = useApp();
  const { data: session } = useSession();
  const { t } = useI18n();
  const { leagues, loading, error } = useLeagues();

  const userId = session?.user?.id;
  // My leagues = owned OR joined (any status), mirroring the leagues page.
  const myLeagues = leagues.filter(
    (league) => league.ownerId === userId || league.isMember,
  );
  // Local mode has no API sessions: /api/leagues 401s, so the section renders
  // the same empty state instead of surfacing the auth error.
  const leaguesUnavailable = !authenticated || Boolean(error);
  const showLeaguesEmpty = leaguesUnavailable || myLeagues.length === 0;
  const leaguesLoading = loading && !leaguesUnavailable;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="border-b-[3px] border-[#d11938] pb-1.5 text-2xl font-black tracking-[0.02em] text-[#12225a]">
          {userName ? `Welcome back, ${userName}` : "Welcome back"}
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">Your league at a glance.</p>
      </header>

      <section aria-label="Overview" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="border border-slate-200 bg-white p-4">
          <p className="text-3xl font-black text-[#12225a]">{teams.length}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Teams
          </p>
        </div>
        <div className="border border-slate-200 bg-white p-4">
          <p className="text-3xl font-black text-[#12225a]">{myLeagues.length}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Leagues
          </p>
        </div>
      </section>

      <section aria-label="Quick actions" className="flex flex-wrap gap-3">
        <Link
          href="/teams/create"
          className="rounded-none bg-[#12225a] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0f1d4d]"
        >
          Create team
        </Link>
        <Link
          href="/leagues"
          className="rounded-none border-2 border-[#12225a] px-4 py-2.5 text-sm font-bold text-[#12225a] hover:bg-[#eef2ff]"
        >
          Create league
        </Link>
      </section>

      <TeamList />

      <section aria-labelledby="dashboard-leagues-heading">
        <h2
          id="dashboard-leagues-heading"
          className="mb-4 border-b-[3px] border-[#d11938] pb-1.5 text-lg font-bold text-[#12225a]"
        >
          {t("leagues.myLeagues")}
        </h2>
        {leaguesLoading ? null : showLeaguesEmpty ? (
          <div className="border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-600">{t("leagues.myEmpty")}</p>
            <Link
              href="/leagues"
              className="mt-4 inline-block rounded-none bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d]"
            >
              {t("leagues.newLeague")}
            </Link>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myLeagues.map((league) => (
              <LeagueCard key={league.id} league={league} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
