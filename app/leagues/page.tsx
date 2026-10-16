"use client";

import { LeagueList } from "@/features/leagues/LeagueList";
import { LeaguesListViewV2 } from "@/features/leagues/LeaguesListViewV2";
import { useUiFlag } from "@/lib/ui-flag";

/**
 * The leagues list route. A thin client page exactly like `/teams` and
 * `/teams/create`: the auth gate, AppShell chrome and session come from the
 * `SessionAppProvider` root layout, so this page just picks the surface.
 *
 * ui-refresh (UIR-1 / UIR-2): FIFTH declared seam — `useUiFlag()` picks
 * EXACTLY one surface, never both. Both surfaces take no props (identical
 * contract by construction), and a bare `useUiFlag()` without a provider falls
 * back to `false` (legacy), so `app/leagues/page.test.tsx` keeps passing
 * unmodified.
 *
 * The branch lives HERE, not inside `LeagueList.tsx`: that file's `LeagueCard`
 * / `StatusBadge` exports are shared atoms consumed by BOTH dashboards, and
 * the league detail route (`/leagues/[id]`) must stay flag-free (UIR-2).
 */
export default function LeaguesPage() {
  const uiV2 = useUiFlag();
  return uiV2 ? <LeaguesListViewV2 /> : <LeagueList />;
}
