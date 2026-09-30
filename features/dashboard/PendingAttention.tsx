"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { formatMatchDate } from "@/features/leagues/MatchCard";
import type { League } from "@/features/leagues/api";
import type { DashboardFixture } from "@/app/api/me/dashboard/route";

export interface PendingAttentionProps {
  /** Fixtures whose rival date proposal awaits the viewer's response. */
  proposals: DashboardFixture[];
  /** Fixtures with a live match in progress. */
  live: DashboardFixture[];
  /** Fixtures whose result is still owed to the league. */
  resultsPending: DashboardFixture[];
  /** Open leagues awaiting start — derived by the dashboard from `useLeagues`. */
  openLeagues: League[];
}

/** One actionable row of the pending-attention list. */
interface AttentionRow {
  key: string;
  href: string;
  title: string;
  meta: string;
  /** Secondary line (proposed date, live score) — omitted when absent. */
  detail?: string;
  /** Right-hand affordance: a plain label chip or the LIVE badge. */
  chip: ReactNode;
}

const fixtureHref = (f: DashboardFixture) => `/leagues/${f.leagueId}/fixtures/${f.fixtureId}`;
const fixtureTitle = (f: DashboardFixture) => `${f.homeTeam.name} vs ${f.awayTeam.name}`;
const fixtureMeta = (f: DashboardFixture) => `${f.leagueName} · Round ${f.round}`;

/** Square outlined chip (existing navy/red tokens, no new variants). */
const labelChip = (text: string) => (
  <span className="shrink-0 rounded-none border border-navy px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-navy">
    {text}
  </span>
);

/**
 * Zone 1 of the home dashboard (issue #268): what blocks progress — rival
 * date proposals, live matches, results still owed, open leagues awaiting
 * start — as one prioritised list of real links (each row links to its
 * fixture/league page). Home-chrome copy is hardcoded English per the repo
 * convention; the LIVE badge reuses the matches-feature `match.liveBadge`
 * pattern (locale-aware: EN VIVO / LIVE). An empty payload renders a short,
 * calm line instead of a broken-looking list.
 */
export function PendingAttention({
  proposals,
  live,
  resultsPending,
  openLeagues,
}: PendingAttentionProps) {
  const { t } = useI18n();

  // ONE row per fixture, whatever predicate claims it. Two overlaps are real:
  // `propose` has no live-match guard and the live flow never closes a
  // ScheduleProposal, so an in-play fixture can carry an active rival proposal
  // too — yet `MatchCard` hides negotiation while the match runs (`canNegotiate`
  // requires !liveActive), which would make the "Respond" card dead. And a
  // rejornar fixture keeps its `scheduledAt`, so it is also "result owed".
  // Priority: live → proposal → result.
  const liveFixtureIds = new Set(live.map((f) => f.fixtureId));
  const proposalFixtureIds = new Set(proposals.map((f) => f.fixtureId));

  const rows: AttentionRow[] = [
    ...proposals
      .filter((f) => !liveFixtureIds.has(f.fixtureId))
      .map((f) => ({
        key: `proposal-${f.fixtureId}`,
        href: fixtureHref(f),
        title: fixtureTitle(f),
        meta: fixtureMeta(f),
        detail: f.pendingProposal
          ? `Date proposal for ${formatMatchDate(f.pendingProposal.date)}`
          : undefined,
        chip: labelChip("Respond"),
      })),
    ...live.map((f) => ({
      key: `live-${f.fixtureId}`,
      href: fixtureHref(f),
      title: fixtureTitle(f),
      meta: fixtureMeta(f),
      detail: f.live ? `${f.live.homeScore} : ${f.live.awayScore}` : undefined,
      chip: (
        <span className="shrink-0 rounded-sm bg-red px-1.5 py-px text-[9px] font-extrabold tracking-[0.15em] text-white">
          {t("match.liveBadge")}
        </span>
      ),
    })),
    ...resultsPending
      .filter((f) => !proposalFixtureIds.has(f.fixtureId) && !liveFixtureIds.has(f.fixtureId))
      .map((f) => ({
        key: `result-${f.fixtureId}`,
        href: fixtureHref(f),
        title: fixtureTitle(f),
        meta: fixtureMeta(f),
        chip: labelChip("Report result"),
      })),
    ...openLeagues.map((league) => ({
      key: `league-${league.id}`,
      href: `/leagues/${league.id}`,
      title: league.name,
      meta: "Open league awaiting start",
      chip: labelChip("View"),
    })),
  ];

  return (
    <section aria-labelledby="dashboard-attention-heading">
      <h2
        id="dashboard-attention-heading"
        className="mb-4 border-b-[3px] border-red pb-1.5 text-lg font-bold text-navy"
      >
        Needs your attention
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-600">Nothing needs your attention right now.</p>
      ) : (
        <ul className="grid gap-2">
          {rows.map((row) => (
            <li key={row.key}>
              <Link
                href={row.href}
                className="flex items-center justify-between gap-3 border border-slate-200 bg-panel px-4 py-3 hover:bg-info-fill focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-extrabold text-navy">
                    {row.title}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{row.meta}</span>
                  {row.detail ? (
                    <span className="block truncate text-xs font-bold text-red">{row.detail}</span>
                  ) : null}
                </span>
                {row.chip}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
