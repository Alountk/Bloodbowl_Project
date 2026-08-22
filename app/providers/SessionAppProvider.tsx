"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { AppShell } from "@/components/AppShell";
import { ApiTeamStore } from "@/features/teams/store/ApiTeamStore";
import { useTeamMigration } from "@/features/migration/useTeamMigration";
import { MigrationReloadContext } from "./MigrationReloadContext";

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
 *
 * The home route ("/") is exempt from the shared shell: the server page decides
 * between the public Landing (anonymous, no app chrome) and a self-shelled
 * `HomeDashboard`, so wrapping "/" here would double-mount the sidebar.
 */
export function SessionAppProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  // Stable ApiTeamStore instance across re-renders.
  const [apiStore] = useState(() => new ApiTeamStore());
  // Bumped after a migration so AppProvider re-hydrates and shows migrated teams.
  const [migrationReload, setMigrationReload] = useState(0);

  const authenticated = status === "authenticated";
  // This layout-level component is the ONE stable host for the one-shot legacy
  // migration: unlike the home page it survives the post-login `router.refresh`
  // that remounts the dashboard, so the migration's async run is never cancelled
  // and its reload bump always reaches the mounted shell. It never runs while on
  // an auth page (the /login → / transition window) nor while unauthenticated;
  // on "/" the bump flows to the dashboard through MigrationReloadContext.
  const isAuthPage = pathname === "/login" || pathname === "/signup";
  useTeamMigration(authenticated && !isAuthPage, {
    onMigrated: () => setMigrationReload((v) => v + 1),
  });

  if (pathname === "/") {
    return (
      <MigrationReloadContext.Provider value={migrationReload}>
        {children}
      </MigrationReloadContext.Provider>
    );
  }

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
      onLogout={async () => {
        // Use router.push (the lint-approved navigation for event handlers).
        // Passing redirectTo to signOut makes Auth.js build the URL from the
        // server's own host (HOSTNAME=0.0.0.0 in the container), which produced
        // "0.0.0.0:3444/login" in production. We AWAIT the sign-out POST so
        // the session cookie is cleared before navigating — otherwise the
        // proxy still sees an authenticated user and bounces the landing back
        // to the dashboard.
        await signOut({ redirect: false });
        router.push("/");
      }}
      reloadVersion={migrationReload}
    >
      {children}
    </AppShell>
  );
}
