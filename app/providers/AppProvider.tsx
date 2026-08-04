"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Team } from "@/features/teams/types";

interface AppContextValue {
  teams: Team[];
  addTeam: (team: Team) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const INITIAL_TEAMS: Team[] = [];

export function AppProvider({
  children,
  initialTeams = INITIAL_TEAMS,
}: {
  children: ReactNode;
  initialTeams?: Team[];
}) {
  const [teams, setTeams] = useState<Team[]>(initialTeams);
  const [searchQuery, setSearchQuery] = useState("");

  const addTeam = useCallback((team: Team) => {
    setTeams((previous) => [...previous, team]);
  }, []);

  const value = useMemo(
    () => ({ teams, addTeam, searchQuery, setSearchQuery }),
    [teams, addTeam, searchQuery],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}
