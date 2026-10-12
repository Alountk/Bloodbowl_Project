"use client";

import { TeamsPage } from "@/features/teams/TeamsPage";
import { TeamsListViewV2 } from "@/features/teams/list/TeamsListViewV2";
import { useUiFlag } from "@/lib/ui-flag";

/**
 * The dedicated Teams route. A thin client page exactly like `/leagues`: the
 * auth gate, AppShell chrome (nav, user menu), and the user-scoped team store
 * are supplied by the `SessionAppProvider` root layout, so this page just
 * renders the `TeamsPage` feature inside that shell.
 *
 * ui-refresh (UIR-1 / UIR-2): SECOND declared seam — `useUiFlag()` picks
 * EXACTLY one surface, never both. Both surfaces take zero props (identical
 * contract by construction), and a bare `useUiFlag()` without a provider
 * falls back to `false` (legacy), so `app/teams/page.test.tsx` keeps passing
 * unchanged. The flag is consumed only here — this page is the seam.
 */
export default function TeamsPageRoute() {
  const uiV2 = useUiFlag();
  return uiV2 ? <TeamsListViewV2 /> : <TeamsPage />;
}
