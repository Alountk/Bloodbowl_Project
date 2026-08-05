"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Team } from "@/features/teams/types";
import type { TeamStore } from "@/features/teams/store/TeamStore";
import { LocalStorageTeamStore } from "@/features/teams/store/LocalStorageTeamStore";
import type { CreateTeamValues } from "@/features/teams/create/useCreateTeamForm";

interface AppContextValue {
  teams: Team[];
  isHydrated: boolean;
  addTeam: (values: CreateTeamValues) => Promise<void>;
  removeTeam: (id: string) => Promise<void>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  children,
  store = new LocalStorageTeamStore(),
}: {
  children: ReactNode;
  store?: TeamStore;
}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    store.list().then((loaded) => {
      setTeams(loaded);
      setIsHydrated(true);
    });
  }, [store]);

  const addTeam = useCallback(
    async (values: CreateTeamValues) => {
      const team: Team = { id: crypto.randomUUID(), ...values };
      await store.save(team);
      setTeams((prev) => [...prev, team]);
    },
    [store],
  );

  const removeTeam = useCallback(
    async (id: string) => {
      await store.remove(id);
      setTeams((prev) => prev.filter((t) => t.id !== id));
    },
    [store],
  );

  const value = useMemo(
    () => ({ teams, isHydrated, addTeam, removeTeam, searchQuery, setSearchQuery }),
    [teams, isHydrated, addTeam, removeTeam, searchQuery],
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
