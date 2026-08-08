"use client";

import { useState, type ReactNode } from "react";
import { signOut, useSession } from "next-auth/react";
import { AppShell } from "@/components/AppShell";
import { ApiTeamStore } from "@/features/teams/store/ApiTeamStore";
import { useTeamMigration } from "@/features/migration/useTeamMigration";

/**
 * Session-aware application gate.
 *
 * Reads the Auth.js session and:
 * - while `loading`, renders a lightweight loading state (no flash of gated content);
 * - when `authenticated`, backs the shell with a stable `ApiTeamStore` and wires
 *   logout to `signOut`;
 * - when `unauthenticated`, falls back to the local (LocalStorage) shell. In
 *   auth mode the proxy redirects unauthenticated users to `/login` before this
 *   branch renders, so it only appears in anonymous/local mode.
 */
export function SessionAppProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  // Stable ApiTeamStore instance across re-renders.
  const [apiStore] = useState(() => new ApiTeamStore());
  // Bumped after a migration so AppProvider re-hydrates and shows migrated teams.
  const [migrationReload, setMigrationReload] = useState(0);

  const authenticated = status === "authenticated";
  // One-time per-browser legacy localStorage migration, run on first auth.
  // Non-blocking and idempotent (see useTeamMigration); never interrupts login.
  // On success it bumps migrationReload so the already-hydrated list re-fetches
  // and shows the migrated teams without a manual reload.
  useTeamMigration(authenticated, {
    onMigrated: () => setMigrationReload((v) => v + 1),
  });

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
        <p className="text-sm text-slate-500" role="status">
          Loading…
        </p>
      </div>
    );
  }

  return (
    <AppShell
      store={authenticated ? apiStore : undefined}
      authenticated={authenticated}
      onLogout={() => signOut({ redirectTo: "/login" })}
      reloadVersion={migrationReload}
    >
      {children}
    </AppShell>
  );
}
