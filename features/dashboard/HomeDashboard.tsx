"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { AppShell } from "@/components/AppShell";
import { hardNavigate } from "@/lib/navigation";
import { ApiTeamStore } from "@/features/teams/store/ApiTeamStore";
import { useMigrationReload } from "@/app/providers/MigrationReloadContext";
import { Dashboard } from "./Dashboard";

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
 */
export function HomeDashboard({ authenticated, userName }: HomeDashboardProps) {
  // Stable ApiTeamStore instance across re-renders.
  const [apiStore] = useState(() => new ApiTeamStore());
  const migrationReload = useMigrationReload();

  return (
    <AppShell
      store={authenticated ? apiStore : undefined}
      authenticated={authenticated}
      onLogout={async () => {
        // Await the sign-out POST so the session cookie is cleared before we
        // leave, then do a FULL reload: a client-side push to "/" is answered
        // from the Router Cache, leaving the signed-in dashboard on screen with
        // the session already gone. See `hardNavigate`.
        await signOut({ redirect: false });
        hardNavigate("/");
      }}
      reloadVersion={migrationReload}
    >
      <Dashboard authenticated={authenticated} userName={userName} />
    </AppShell>
  );
}
