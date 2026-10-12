"use client";

import Link from "next/link";
import { useApp } from "@/app/providers/AppProvider";
import { getRaceById } from "@/features/teams/data/races";
import { computeSpendableBalance } from "@/features/teams/roster";
import { formatRulebookCost } from "@/features/teams/format";
import { useDashboardInbox } from "./useDashboardInbox";

interface DashboardProps {
  /** True when backed by an authenticated session (API store + real leagues). */
  authenticated: boolean;
  /** The session user's display name (or email); null in local/anonymous mode. */
  userName: string | null;
}

/**
 * ui-refresh dashboard V2 surface (UIR-2 / UIR-4) — SLICE 1 SKELETON: the
 * welcome header plus the "Your teams" landmark. The remaining zone landmarks
 * (`ui-v2-dashboard-attention`, `-next-match`, `-stats`, `-leagues`) land in
 * slice 2 against Stitch "04 dashboard".
 *
 * Third declared seam (`features/dashboard/HomeDashboard.tsx`): mounted
 * INSTEAD of legacy `Dashboard` when the `bb-ui` flag is ON, called with the
 * SAME `{authenticated, userName}` props — identical contract by construction.
 *
 * Data channel (UIR-2 presentation-only): V2 self-fetches through the SAME
 * legacy hooks, never a new endpoint — `useApp` (team store) and
 * `useDashboardInbox` (`GET /api/me/dashboard`, skipped in local mode) feed
 * the summary here; slice 2 adds `useSession`/`useI18n`/`useLeagues`/
 * `useCareerStats` for its zones. Money maths stays in the shared roster
 * helpers, exactly like legacy.
 *
 * HARNESS NOTE (design "E2E navigation trace"): the flag-ON e2e helper
 * `createTeamAndOpenList` lands on `/` after the wizard and clicks
 * `getByRole("link", { name: /ready to improve/i })` to reach `/teams` — so
 * this skeleton MUST keep the legacy "Your teams" summary link with that copy
 * (and the `/teams` href) or every existing flag-ON roster/list test breaks.
 *
 * Testid vocabulary is `ui-v2-dashboard-*` ONLY; legacy marker ids
 * (`dashboard-teams-heading`, `dashboard-next-match-heading`,
 * `dashboard-leagues-heading`, the Overview/Quick actions labels) are never
 * reused, so the never-both assertions hold at the seam.
 */
export function DashboardV2({ authenticated, userName }: DashboardProps) {
  const { teams, isHydrated } = useApp();
  // Same zone-1 feed legacy uses: null while loading / on error / in local
  // mode, so the ready-to-improve count defensively reads 0 there.
  const inbox = useDashboardInbox(authenticated);
  const readyToImprove = inbox.data?.teams.readyToImprove ?? 0;

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

      {/* Same hydration gate as legacy: no flash of "0 teams" before the
          store lists. The link copy is the e2e harness contract (see above). */}
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
          <Link
            href="/teams"
            className="block border border-slate-200 bg-panel px-4 py-3 text-sm font-bold text-navy hover:bg-info-fill focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy"
          >
            {teams.length} {teams.length === 1 ? "team" : "teams"} ·{" "}
            {formatRulebookCost(totalTreasury)} treasury · {readyToImprove} ready to
            improve
          </Link>
        </section>
      ) : null}
    </div>
  );
}
