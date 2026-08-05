"use client";

import { useState, type ReactNode } from "react";
import { AppProvider } from "@/app/providers/AppProvider";
import { LocalStorageTeamStore } from "@/features/teams/store/LocalStorageTeamStore";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export function AppShell({ children }: { children: ReactNode }) {
  // Stable store instance across re-renders; created only on the client.
  const [store] = useState(() => new LocalStorageTeamStore());

  return (
    <AppProvider store={store}>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <Topbar />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </AppProvider>
  );
}
