"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { logout } from "@/lib/auth/logout";
import { ApiTeamStore } from "@/features/teams/store/ApiTeamStore";
import { useMigrationReload } from "@/app/providers/MigrationReloadContext";
import { useUiFlag } from "@/lib/ui-flag";
import { Dashboard } from "./Dashboard";
import { DashboardV2 } from "./DashboardV2";

interface HomeDashboardProps {
  /** True when backed by an authenticated session (API store + real leagues). */
  authenticated: boolean;
  /** The session user's display name (or email); null in local/anonymous mode. */
  userName: string | null;
}

/**
 * Self-shelled dashboard for the home route. The root layout's shared shell is
 * skipped on "/" (the server page renders the public Landing for anonymous
 * users, which must not carry the app chrome), so this client wrapper provides
 * the AppShell itself — mirroring `SessionAppProvider`'s store/logout wiring
 * for the dashboard. The one-shot legacy migration stays in the layout's
 * SessionAppProvider; its reload bump reaches this shell via
 * `useMigrationReload`. Logout returns to "/" (the landing).
 *
 * ui-refresh (UIR-1 / UIR-2): THIRD declared seam — `useUiFlag()` picks
 * EXACTLY one surface, never both, and both take the same
 * `{authenticated, userName}` props (identical contract by construction).
 * The flag is consumed only inside this authenticated dashboard branch: the
 * anonymous Landing branch of `app/page.tsx` never reaches this component,
 * so `/` stays flag-free for anonymous visitors. A bare `useUiFlag()` without
 * a provider falls back to `false` (legacy), so flag-OFF tests keep passing
 * unchanged.
 */
export function HomeDashboard({ authenticated, userName }: HomeDashboardProps) {
  // Stable ApiTeamStore instance across re-renders.
  const [apiStore] = useState(() => new ApiTeamStore());
  const migrationReload = useMigrationReload();
  const uiV2 = useUiFlag();

  return (
    <AppShell
      store={authenticated ? apiStore : undefined}
      authenticated={authenticated}
      onLogout={logout}
      reloadVersion={migrationReload}
    >
      {uiV2 ? (
        <DashboardV2 authenticated={authenticated} userName={userName} />
      ) : (
        <Dashboard authenticated={authenticated} userName={userName} />
      )}
    </AppShell>
  );
}
