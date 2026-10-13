"use client";

import { CreateTeamForm } from "@/features/teams/create/CreateTeamForm";
import { CreateTeamFormV2 } from "@/features/teams/create/CreateTeamFormV2";
import { useUiFlag } from "@/lib/ui-flag";

/**
 * The create-team wizard route. A thin client page exactly like `/teams`: the
 * auth gate, AppShell chrome and user-scoped team store come from the
 * `SessionAppProvider` root layout, so this page only picks the surface.
 *
 * ui-refresh (UIR-1 / UIR-2): FOURTH declared seam — `useUiFlag()` picks
 * EXACTLY one surface, never both. Both surfaces take the same
 * `CreateTeamFormProps` defaults (the route passes no props — identical
 * contract by construction), and a bare `useUiFlag()` without a provider falls
 * back to `false` (legacy), so `app/teams/create/page.test.tsx` keeps passing
 * unchanged.
 *
 * The branch lives HERE, not inside `CreateTeamForm`: that component has a
 * second caller (`features/leagues/CreateLeagueTeamModal.tsx`) which must keep
 * rendering legacy with the flag ON (UIR-2 modal-embed clause).
 */
export default function TeamCreatePage() {
  const uiV2 = useUiFlag();
  return uiV2 ? <CreateTeamFormV2 /> : <CreateTeamForm />;
}
