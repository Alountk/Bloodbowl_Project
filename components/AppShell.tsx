"use client";

import { useState, type ReactNode } from "react";
import { AppProvider } from "@/app/providers/AppProvider";
import { LocalStorageTeamStore } from "@/features/teams/store/LocalStorageTeamStore";
import type { TeamStore } from "@/features/teams/store/TeamStore";
import { useI18n } from "@/lib/i18n";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

interface AppShellProps {
  children: ReactNode;
  /** Store passed from an authenticated parent (e.g. ApiTeamStore), else LocalStorage. */
  store?: TeamStore;
  /** True when the shell is backed by an authenticated session; shows logout. */
  authenticated?: boolean;
  /** Invoked by the logout control. No-op when absent. */
  onLogout?: () => void;
  /** Increment to force AppProvider to re-hydrate (e.g. after localStorage migration). */
  reloadVersion?: number;
}

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
  // The mobile drawer mounts only while open, so it never duplicates the
  // always-mounted desktop Sidebar aria landmark.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { t } = useI18n();

  const openMenu = () => setMobileNavOpen(true);
  const closeMenu = () => setMobileNavOpen(false);

  return (
    <AppProvider store={store} authenticated={authenticated} onLogout={onLogout} reloadVersion={reloadVersion}>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <Topbar onMenuClick={openMenu} />
          <main className="flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
      {mobileNavOpen ? (
        <>
          {/* Scrim: renders behind the drawer; click closes. */}
          <button
            type="button"
            aria-label={t("nav.closeMenu")}
            onClick={closeMenu}
            className="fixed inset-0 z-40 bg-slate-900/45 md:hidden"
            data-testid="drawer-scrim"
          />
          <Sidebar variant="drawer" onNavigate={closeMenu} />
        </>
      ) : null}
    </AppProvider>
  );
}
