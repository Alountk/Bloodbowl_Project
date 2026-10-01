"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApp } from "@/app/providers/AppProvider";
import { useI18n } from "@/lib/i18n";
import { LeagueCard } from "@/features/leagues/LeagueList";
import { isOwnerEquivalent } from "@/features/leagues/access";
import { useLeagues } from "@/features/leagues/useLeagues";
import { getRaceById } from "@/features/teams/data/races";
import { computeSpendableBalance } from "@/features/teams/roster";
import { formatRulebookCost } from "@/features/teams/format";
import { formatMatchDate } from "@/features/leagues/MatchCard";
import type { DashboardFixture } from "@/app/api/me/dashboard/route";
import { PendingAttention } from "./PendingAttention";
import { useDashboardInbox } from "./useDashboardInbox";
import { useCareerStats } from "./useCareerStats";

interface DashboardProps {
  /** True when backed by an authenticated session (API store + real leagues). */
  authenticated: boolean;
  /** The session user's display name (or email); null in local/anonymous mode. */
  userName: string | null;
}

/** Square stat card (existing navy/slate tokens — no new variants). */
function StatCard({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="border border-slate-200 bg-panel p-4">
      <p className="text-3xl font-black text-navy">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
    </div>
  );
}

/**
 * Zone 2 of the home dashboard (issue #268): the next scheduled fixture as one
 * whole-card link (navy header strip — league + round + LIVE badge; body —
 * home vs away; footer — status word + scheduled date). The dashboard renders
 * this ONLY when `nextMatch` is non-null: an empty labelled landmark would be
 * noise for screen readers, so the common no-fixture case renders nothing. The
 * LIVE badge reuses the matches-feature `match.liveBadge` key (locale-aware:
 * EN VIVO / LIVE), same as the attention zone.
 */
function NextMatchCard({ match }: { match: DashboardFixture }) {
  const { t } = useI18n();
  // English home chrome. The server's nextMatch filter requires `scheduledAt`
  // (deriveFixtureStatus → "scheduled") and excludes played fixtures; "Pending"
  // stays as the defensive word for any other status a future payload carries.
  const statusWord = match.status === "scheduled" ? "Scheduled" : "Pending";
  return (
    <section aria-labelledby="dashboard-next-match-heading">
      <h2
        id="dashboard-next-match-heading"
        className="mb-4 border-b-[3px] border-red pb-1.5 text-lg font-bold text-navy"
      >
        Next match
      </h2>
      <Link
        href={`/leagues/${match.leagueId}/fixtures/${match.fixtureId}`}
        className="block border border-slate-200 bg-panel hover:bg-info-fill focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy"
      >
        <span className="flex items-center justify-between gap-2 bg-navy px-4 py-2 text-sm font-bold text-white">
          <span className="truncate">
            {match.leagueName} · Round {match.round}
          </span>
          {match.live?.status === "live" ? (
            <span className="shrink-0 rounded-sm bg-red px-1.5 py-px text-[9px] font-extrabold tracking-[0.15em] text-white">
              {t("match.liveBadge")}
            </span>
          ) : null}
        </span>
        <span className="block px-4 py-3 text-sm font-extrabold text-navy">
          {match.homeTeam.name} vs {match.awayTeam.name}
        </span>
        <span className="block border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
          {statusWord} · {formatMatchDate(match.scheduledAt)}
        </span>
      </Link>
    </section>
  );
}

/**
 * Classic home dashboard for logged-in users (issue #268): welcome header,
 * then the priority zone — pending attention (proposals / live / results owed /
 * open leagues) fed by the single `GET /api/me/dashboard` aggregate — the next
 * match card (same payload, rendered only when a fixture qualifies), the stat
 * cards (teams + leagues from data already loaded; career matches and W-D-L
 * from `GET /api/me/stats`; squad PE from the dashboard payload), the
 * state-driven quick actions, the compact team
 * summary linking to `/teams` (the list itself lives on the teams page now),
 * and the my-leagues list. Home-chrome copy (welcome/inbox/stats/quick actions/
 * summary) is hardcoded English per the repo convention; the embedded leagues
 * section keeps its own (Spanish) `t()` copy. The stats and inbox zones render
 * only after their feed resolves — hidden while loading, on error, and in local
 * mode (no API session) — so nothing flashes.
 */
export function Dashboard({ authenticated, userName }: DashboardProps) {
  const { teams, isHydrated } = useApp();
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
  const resultsPending = inboxData?.resultsPending ?? [];
  const readyToImprove = inboxData?.teams.readyToImprove ?? 0;
  // Career stats (matches played + W-D-L) for the widened stat cards. Hidden
  // with the rest of the /api/me/stats-backed pair while loading or on error.
  const careerStats = useCareerStats(authenticated);
  // Open leagues awaiting start, derived from the ALREADY-loaded list (no
  // extra request). The server computes `canManage` (owner or `leagues.manage`)
  // on every list row (app/api/leagues/route.ts), so the owner's own open
  // league is covered by the same predicate as a member's.
  const openLeagues = leagues.filter(
    (league) => league.status === "open" && (league.isMember || league.canManage === true),
  );

  // Total treasury across the NON-archived teams already in memory (the
  // team-count card also comes from here — `stats.teams` counts archived teams,
  // which is right for career stats and wrong for "your squads right now").
  // Money maths stays in the shared roster helpers — never re-derived here.
  const totalTreasury = teams.reduce((total, team) => {
    const race = getRaceById(team.raceId) ?? {
      id: team.raceId,
      name: team.raceId,
      rerollCost: 0,
      positionals: [],
    };
    return total + computeSpendableBalance(team, race);
  }, 0);

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

      {/* Zone 2 (issue #268 reading order: attention → next match → stats).
          Null when the user has no dated, unplayed fixture — no empty landmark. */}
      {inboxData?.nextMatch ? <NextMatchCard match={inboxData.nextMatch} /> : null}

      <section aria-label="Overview" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard value={teams.length} label="Teams" />
        <StatCard value={myLeagues.length} label="Leagues" />
        {careerStats ? (
          <>
            <StatCard value={careerStats.matches} label="Matches" />
            <StatCard
              value={`${careerStats.wins}-${careerStats.draws}-${careerStats.losses}`}
              label="W-D-L"
            />
          </>
        ) : null}
        {/* Squad PE (server sum over ACTIVE squads, `DashboardPayload.teams`).
            Formatted with the same grouped-thousands helper as the treasury. */}
        {inboxData ? (
          <StatCard value={formatRulebookCost(inboxData.teams.squadPe)} label="Squad PE" />
        ) : null}
      </section>

      {/* Rendered only when something qualifies: an empty labelled landmark is
          noise for screen readers and leaves a phantom gap. `isHydrated` gates
          the two store-backed conditions so nobody is shown a "Create team"
          affordance in the instant before the team store has loaded. */}
      {(isHydrated && (teams.length === 0 || myLeagues.length === 0)) ||
      resultsPending.length > 0 ? (
      <section aria-label="Quick actions" className="flex flex-wrap gap-3">
        {isHydrated && teams.length === 0 ? (
          <Link
            href="/teams/create"
            className="rounded-none bg-navy px-4 py-2.5 text-sm font-bold text-white hover:bg-navy-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy"
          >
            Create team
          </Link>
        ) : null}
        {isHydrated && myLeagues.length === 0 ? (
          <Link
            href="/leagues"
            className="rounded-none border-2 border-navy px-4 py-2.5 text-sm font-bold text-navy hover:bg-info-fill focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy"
          >
            Join/Find a league
          </Link>
        ) : null}
        {resultsPending.length > 0 ? (
          <Link
            href={`/leagues/${resultsPending[0].leagueId}/fixtures/${resultsPending[0].fixtureId}`}
            className="rounded-none border-2 border-navy px-4 py-2.5 text-sm font-bold text-navy hover:bg-info-fill focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy"
          >
            Report result
          </Link>
        ) : null}
      </section>
      ) : null}

      {isHydrated ? (
        <section aria-labelledby="dashboard-teams-heading">
          <h2
            id="dashboard-teams-heading"
            className="mb-4 border-b-[3px] border-red pb-1.5 text-lg font-bold text-navy"
          >
            Your teams
          </h2>
          <Link
            href="/teams"
            className="block border border-slate-200 bg-panel px-4 py-3 text-sm font-bold text-navy hover:bg-info-fill focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy"
          >
            {teams.length} {teams.length === 1 ? "team" : "teams"} ·{" "}
            {formatRulebookCost(totalTreasury)} treasury · {readyToImprove} ready to improve
          </Link>
        </section>
      ) : null}

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
