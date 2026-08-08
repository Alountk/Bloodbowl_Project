"use client";

import { useState, type ReactNode } from "react";
import { AppProvider } from "@/app/providers/AppProvider";
import { LocalStorageTeamStore } from "@/features/teams/store/LocalStorageTeamStore";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export function AppShell({ children }: { children: ReactNode }) {
  // Stable store instance across re-renders; created only on the client.
  const [store] = useState(() => new LocalStorageTeamStore());
  // The mobile drawer mounts only while open, so it never duplicates the
  // always-mounted desktop Sidebar aria landmark.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const openMenu = () => setMobileNavOpen(true);
  const closeMenu = () => setMobileNavOpen(false);

  return (
    <AppProvider store={store}>
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
            aria-label="Close menu"
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
