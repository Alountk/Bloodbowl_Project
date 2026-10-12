"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApp } from "@/app/providers/AppProvider";
import { useI18n } from "@/lib/i18n";
import { LeagueCard } from "@/features/leagues/LeagueList";
import { isOwnerEquivalent } from "@/features/leagues/access";
import { useLeagues } from "@/features/leagues/useLeagues";
import { TeamEmblem } from "@/features/leagues/TeamEmblem";
import { getRaceById } from "@/features/teams/data/races";
import {
  computeCoachingCost,
  computeRosterCostFromPlayers,
  computeSpendableBalance,
} from "@/features/teams/roster";
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
function StatCard({
  testid,
  value,
  label,
  detail,
}: {
  testid: string;
  value: number | string;
  label: string;
  /** Optional second line (the W-D-L record under "Matches"). */
  detail?: string;
}) {
  return (
    <div data-testid={testid} className="border border-slate-200 bg-panel p-4">
      <p className="text-3xl font-black text-navy">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      {detail ? (
        <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{detail}</p>
      ) : null}
    </div>
  );
}

/**
 * Zone 2 (Stitch "04 dashboard"): the next fixture as ONE full-width card —
 * navy strip (league · "Round N" + LIVE badge), body (both teams), footer
 * (the scheduled date, or "No date" when the payload carries none). Rendered
 * ONLY when a fixture qualifies — an empty labelled landmark is noise for
 * screen readers (same rule as legacy).
 */
function NextMatchCard({ match }: { match: DashboardFixture }) {
  const { t } = useI18n();
  return (
    <section
      data-testid="ui-v2-dashboard-next-match"
      aria-labelledby="ui-v2-dashboard-next-match-heading"
    >
      <h2
        id="ui-v2-dashboard-next-match-heading"
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
          {match.scheduledAt ? formatMatchDate(match.scheduledAt) : "No date"}
        </span>
      </Link>
    </section>
  );
}

/**
 * ui-refresh dashboard V2 surface (UIR-2 / UIR-4) — full Stitch translation
 * ("04 dashboard" desktop / "M 04" mobile), slice 2.
 *
 * Third declared seam (`features/dashboard/HomeDashboard.tsx`): mounted
 * INSTEAD of legacy `Dashboard` when the `bb-ui` flag is ON, called with the
 * SAME `{authenticated, userName}` props — identical contract by construction.
 *
 * Data channel (UIR-2 presentation-only): V2 self-fetches through the SAME
 * legacy hooks, never a new endpoint — `useApp` (team store), `useSession`,
 * `useI18n`, `useLeagues` (`GET /api/leagues`), `useDashboardInbox`
 * (`GET /api/me/dashboard`, skipped in local mode) and `useCareerStats`
 * (`GET /api/me/stats`); money/TV maths stays in the shared roster helpers,
 * exactly like legacy. Zone reuse (design open-question, resolved for slice
 * 2): `PendingAttention` (attention stack — same priority rows and English
 * chips) and `LeagueCard` (league name card + status badge) are shared
 * components, so their internal markup/ids belong to BOTH surfaces and are
 * not legacy-dashboard markers.
 *
 * Zones (Stitch "04" / "M 04"): welcome header (props-driven, slice 1),
 * "Needs your attention", "Next match", stat cards (2×2 mobile / 4-across
 * desktop, CSS-only per the design decisions table), "Your teams" (per-team
 * cards + the harness summary link) and "My leagues". Home-chrome copy is
 * hardcoded English per the repo convention; no hamburger — `AppNav` owns the
 * shell.
 *
 * HARNESS NOTE (design "E2E navigation trace"): the flag-ON e2e helper
 * `createTeamAndOpenList` lands on `/` after the wizard and clicks
 * `getByRole("link", { name: /ready to improve/i })` to reach `/teams` — so
 * this surface MUST keep the legacy "Your teams" summary link with that copy
 * (and the `/teams` href) or every existing flag-ON roster/list test breaks.
 *
 * Testid vocabulary is `ui-v2-dashboard-*` ONLY; legacy marker ids
 * (`dashboard-teams-heading`, `dashboard-next-match-heading`,
 * `dashboard-leagues-heading`, the Overview/Quick actions labels) are never
 * reused, so the never-both assertions hold at the seam.
 */
export function DashboardV2({ authenticated, userName }: DashboardProps) {
  const { teams, isHydrated } = useApp();
  const { data: session } = useSession();
  const { t } = useI18n();
  const { leagues, loading, error } = useLeagues();

  const userId = session?.user?.id;
  const role = session?.user?.role;
  // Same my-leagues channel as legacy: owner-equivalent (owner OR a
  // `leagues.manage` holder) OR joined (any status). DISPLAY ONLY — the
  // server re-reads the DB role and authorizes every request.
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
  // Open leagues awaiting start, derived from the ALREADY-loaded list (no
  // extra request) — the attention zone's fourth row type, as in legacy.
  const openLeagues = leagues.filter(
    (league) =>
      league.status === "open" && (league.isMember || league.canManage === true),
  );

  // Zone-1 feed: one server-computed aggregate for proposals, live fixtures,
  // results owed and the next match. Hidden while loading / on error / in
  // local mode — see the hook docstring (identical to legacy).
  const inbox = useDashboardInbox(authenticated);
  const inboxData = inbox.loading ? null : inbox.data;
  const readyToImprove = inboxData?.teams.readyToImprove ?? 0;
  // Career stats (matches + W-D-L) for the widened stat cards. Hidden with
  // the rest of the /api/me/stats-backed pair while loading or on error.
  const careerStats = useCareerStats(authenticated);

  // Total treasury across the NON-archived teams already in memory — the same
  // derived value legacy computes (shared roster helpers, no extra fetch).
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
      {/* English home chrome (repo convention), identical copy to legacy. */}
      <header>
        <h1 className="border-b-[3px] border-red pb-1.5 text-2xl font-black tracking-[0.02em] text-navy">
          {userName ? `Welcome back, ${userName}` : "Welcome back"}
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">Your league at a glance.</p>
      </header>

      {/* Zone 1: the shared pending-attention stack, same payload as legacy.
          Hidden while the inbox is loading/on error/local mode. */}
      {inboxData ? (
        <div data-testid="ui-v2-dashboard-attention">
          <PendingAttention
            proposals={inboxData.proposals}
            live={inboxData.live}
            resultsPending={inboxData.resultsPending}
            openLeagues={openLeagues}
          />
        </div>
      ) : null}

      {/* Zone 2: next fixture — null when nothing qualifies (no empty landmark). */}
      {inboxData?.nextMatch ? <NextMatchCard match={inboxData.nextMatch} /> : null}

      {/* Stat cards: 2×2 on mobile, 4-across on desktop — Tailwind breakpoints
          only, per the design decisions table (Stitch "M 04" / "04"). */}
      <div
        data-testid="ui-v2-dashboard-stats"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <StatCard testid="ui-v2-dashboard-stat-teams" value={teams.length} label="Teams" />
        <StatCard
          testid="ui-v2-dashboard-stat-leagues"
          value={myLeagues.length}
          label="Leagues"
        />
        {careerStats ? (
          <StatCard
            testid="ui-v2-dashboard-stat-matches"
            value={careerStats.matches}
            label="Matches"
            detail={`W-D-L ${careerStats.wins}-${careerStats.draws}-${careerStats.losses}`}
          />
        ) : null}
        {/* Squad PE (server sum over ACTIVE squads, `DashboardPayload.teams`). */}
        {inboxData ? (
          <StatCard
            testid="ui-v2-dashboard-stat-squad-pe"
            value={formatRulebookCost(inboxData.teams.squadPe)}
            label="Squad PE"
          />
        ) : null}
      </div>

      {/* Your teams: per-team cards (emblem, name, race, presentation-only TV)
          + the summary link — the hydration gate and that link's copy are the
          e2e harness contract (see docstring). */}
      {isHydrated ? (
        <section
          data-testid="ui-v2-dashboard-teams"
          aria-labelledby="ui-v2-dashboard-teams-heading"
        >
          <h2
            id="ui-v2-dashboard-teams-heading"
            className="mb-4 border-b-[3px] border-red pb-1.5 text-lg font-bold text-navy"
          >
            Your teams
          </h2>
          {teams.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {teams.map((team) => {
                // Race-not-in-catalog fallback (legacy TeamCard convention).
                const race = getRaceById(team.raceId) ?? {
                  id: team.raceId,
                  name: team.raceId,
                  rerollCost: 0,
                  positionals: [],
                };
                // Presentation-only: no per-card progression fetch (UIR-2), so
                // the TV is roster + coaching cost — exactly like the V2 list.
                const tv =
                  computeRosterCostFromPlayers(race, team.roster) +
                  computeCoachingCost(race, team.coaching);
                return (
                  <li
                    key={team.id}
                    data-testid={`ui-v2-dashboard-team-card-${team.id}`}
                    className="overflow-hidden border border-slate-200 bg-panel"
                  >
                    <Link
                      href={`/teams/${team.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-info-fill focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy"
                    >
                      <TeamEmblem
                        teamId={team.id}
                        name={team.name}
                        size="md"
                        emblem={team.emblem}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold text-navy">
                          {team.name}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {race.name}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-700">
                        TV:{" "}
                        <b className="text-navy">{formatRulebookCost(tv)}</b>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <Link
            href="/teams"
            className="mt-3 block border border-slate-200 bg-panel px-4 py-3 text-sm font-bold text-navy hover:bg-info-fill focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy"
          >
            {teams.length} {teams.length === 1 ? "team" : "teams"} ·{" "}
            {formatRulebookCost(totalTreasury)} treasury · {readyToImprove} ready to
            improve
          </Link>
        </section>
      ) : null}

      {/* My leagues: the reused LeagueCard (name card + status badge), same
          filter and empty state as legacy; English home-chrome heading. */}
      <section
        data-testid="ui-v2-dashboard-leagues"
        aria-labelledby="ui-v2-dashboard-leagues-heading"
      >
        <h2
          id="ui-v2-dashboard-leagues-heading"
          className="mb-4 border-b-[3px] border-red pb-1.5 text-lg font-bold text-navy"
        >
          My leagues
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
