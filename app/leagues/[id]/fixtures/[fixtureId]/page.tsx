"use client";

import { use } from "react";
import { MatchView } from "@/features/leagues/MatchView";
import { MatchViewV2 } from "@/features/leagues/MatchViewV2";
import { useUiFlag } from "@/lib/ui-flag";

interface MatchPageProps {
  params: Promise<{ id: string; fixtureId: string }>;
}

/**
 * The fixture route. A thin client page exactly like `/leagues` and
 * `/teams/create`: the auth gate and session come from the root layout, so
 * this page just picks the surface.
 *
 * ui-refresh (UIR-1 / UIR-2): SIXTH declared seam — `useUiFlag()` picks
 * EXACTLY one surface, never both. Both surfaces receive the identical
 * `{leagueId, fixtureId}` contract (the route passes both), and a bare
 * `useUiFlag()` without a provider falls back to `false` (legacy).
 *
 * The branch lives HERE, not inside `MatchView.tsx`: that ~1900-line surface
 * and its shared subcomponents stay flag-free (VERIFY-ONLY), and the spectator
 * route (`/watch/[token]`, `WatchMatchView`) must stay flag-free (UIR-2).
 */
export default function MatchPage({ params }: MatchPageProps) {
  const { id, fixtureId } = use(params);
  const uiV2 = useUiFlag();
  return uiV2 ? (
    <MatchViewV2 leagueId={id} fixtureId={fixtureId} />
  ) : (
    <MatchView leagueId={id} fixtureId={fixtureId} />
  );
}
