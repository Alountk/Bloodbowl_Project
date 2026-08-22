"use client";

import { useState, type ReactNode } from "react";
import { AppProvider } from "@/app/providers/AppProvider";
import { LocalStorageTeamStore } from "@/features/teams/store/LocalStorageTeamStore";
import type { TeamStore } from "@/features/teams/store/TeamStore";
import { AppNav } from "@/components/AppNav";

interface AppShellProps {
  children: ReactNode;
  /** Store passed from an authenticated parent (e.g. ApiTeamStore), else LocalStorage. */
  store?: TeamStore;
  /** True when the shell is backed by an authenticated session; shows the user menu. */
  authenticated?: boolean;
  /** Invoked by the logout control. No-op when absent. */
  onLogout?: () => void;
  /** Increment to force AppProvider to re-hydrate (e.g. after localStorage migration). */
  reloadVersion?: number;
}

/**
 * Authenticated app shell. The unified landing-style `AppNav` (logo + links +
 * user menu, hamburger + drawer on mobile) sits above the page content; the
 * teams search renders in the nav on the home route. The mobile drawer and the
 * auth modal are owned by `AppNav` itself.
 */
export function AppShell({
  children,
  store: providedStore,
  authenticated = false,
  onLogout,
  reloadVersion,
}: AppShellProps) {
  // Stable store instance across re-renders; created only on the client.
  const [localStore] = useState(() => new LocalStorageTeamStore());
  const store = providedStore ?? localStore;

  return (
    <AppProvider store={store} authenticated={authenticated} onLogout={onLogout} reloadVersion={reloadVersion}>
      <div className="flex min-h-screen flex-col">
        <AppNav authenticated={authenticated} onLogout={onLogout} />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </AppProvider>
  );
}
