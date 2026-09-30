"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApp } from "@/app/providers/AppProvider";
import { useI18n } from "@/lib/i18n";
import { LeagueCard } from "@/features/leagues/LeagueList";
import { isOwnerEquivalent } from "@/features/leagues/access";
import { useLeagues } from "@/features/leagues/useLeagues";
import { TeamList } from "@/features/teams/TeamList";
import { TeamSearch } from "@/features/teams/TeamSearch";
import { PendingAttention } from "./PendingAttention";
import { useDashboardInbox } from "./useDashboardInbox";

interface DashboardProps {
  /** True when backed by an authenticated session (API store + real leagues). */
  authenticated: boolean;
  /** The session user's display name (or email); null in local/anonymous mode. */
  userName: string | null;
}

/**
 * Classic home dashboard for logged-in users: welcome header, then the
 * issue-#268 priority zone — pending attention (proposals / live / results
 * owed / open leagues) — fed by the single `GET /api/me/dashboard` aggregate
 * (never N league details), followed by the stat cards (teams + my leagues),
 * quick actions, and the two lists — teams (reusing `TeamList` unchanged) and
 * my leagues (reusing the league card).
 * Home-chrome copy (welcome/inbox/stats/quick actions) is English per the repo
 * convention; the embedded teams/leagues sections keep their own (Spanish)
 * copy. The zone renders only after the aggregate resolves: hidden while
 * loading, on error, and in local mode (no API session), so nothing flashes.
 *
 * Deliberately split from the second PR of #268: the next-match zone, the
 * widened stat cards, the team summary that replaces `TeamList` and the
 * conditional quick actions are NOT here yet.
 */
export function Dashboard({ authenticated, userName }: DashboardProps) {
  const { teams } = useApp();
  const { data: session } = useSession();
  const { t } = useI18n();
  const { leagues, loading, error } = useLeagues();

  const userId = session?.user?.id;
  const role = session?.user?.role;
  // My leagues = owner-equivalent (owner OR a `leagues.manage` holder) OR joined
  // (any status), mirroring the leagues page. Prefer the server `canManage` flag
  // and fall back to the pure predicate over the JWT role snapshot — DISPLAY
  // ONLY, the server re-reads the DB role and authorizes every request.
  const myLeagues = leagues.filter(
    (league) =>
      league.canManage === true ||
      isOwnerEquivalent(league, userId, role) ||
      league.isMember,
  );
  // Local mode has no API sessions: /api/leagues 401s, so the section renders
  // the same empty state instead of surfacing the auth error.
  const leaguesUnavailable = !authenticated || Boolean(error);
  const showLeaguesEmpty = leaguesUnavailable || myLeagues.length === 0;
  const leaguesLoading = loading && !leaguesUnavailable;

  // Zone 1 feed (issue #268): one server-computed aggregate for proposals,
  // live fixtures, results owed and the next match. Hidden while loading and
  // on error/local mode — see the hook docstring.
  const inbox = useDashboardInbox(authenticated);
  const inboxData = inbox.loading ? null : inbox.data;
  // Open leagues awaiting start, derived from the ALREADY-loaded list (no
  // extra request). The server computes `canManage` (owner or `leagues.manage`)
  // on every list row (app/api/leagues/route.ts), so the owner's own open
  // league is covered by the same predicate as a member's.
  const openLeagues = leagues.filter(
    (league) => league.status === "open" && (league.isMember || league.canManage === true),
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="border-b-[3px] border-red pb-1.5 text-2xl font-black tracking-[0.02em] text-navy">
          {userName ? `Welcome back, ${userName}` : "Welcome back"}
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">Your league at a glance.</p>
      </header>

      {inboxData ? (
        <PendingAttention
          proposals={inboxData.proposals}
          live={inboxData.live}
          resultsPending={inboxData.resultsPending}
          openLeagues={openLeagues}
        />
      ) : null}

      <section aria-label="Overview" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="border border-slate-200 bg-panel p-4">
          <p className="text-3xl font-black text-navy">{teams.length}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Teams
          </p>
        </div>
        <div className="border border-slate-200 bg-panel p-4">
          <p className="text-3xl font-black text-navy">{myLeagues.length}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Leagues
          </p>
        </div>
      </section>

      <section aria-label="Quick actions" className="flex flex-wrap gap-3">
        <Link
          href="/teams/create"
          className="rounded-none bg-navy px-4 py-2.5 text-sm font-bold text-white hover:bg-navy-hover"
        >
          Create team
        </Link>
        <Link
          href="/leagues"
          className="rounded-none border-2 border-navy px-4 py-2.5 text-sm font-bold text-navy hover:bg-info-fill"
        >
          Create league
        </Link>
      </section>

      <TeamSearch />

      <TeamList />

      <section aria-labelledby="dashboard-leagues-heading">
        <h2
          id="dashboard-leagues-heading"
          className="mb-4 border-b-[3px] border-red pb-1.5 text-lg font-bold text-navy"
        >
          {t("leagues.myLeagues")}
        </h2>
        {leaguesLoading ? null : showLeaguesEmpty ? (
          <div className="border border-slate-200 bg-panel p-8 text-center">
            <p className="text-sm text-slate-600">{t("leagues.myEmpty")}</p>
            <Link
              href="/leagues"
              className="mt-4 inline-block rounded-none bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy-hover"
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
