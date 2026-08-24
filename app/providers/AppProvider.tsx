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
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import type { CreateTeamValues } from "@/features/teams/create/useCreateTeamForm";
import { createId } from "@/features/teams/id";

interface AppContextValue {
  teams: Team[];
  isHydrated: boolean;
  addTeam: (values: CreateTeamValues) => Promise<void>;
  removeTeam: (id: string) => Promise<void>;
  /** Re-lists the store so server-side mutations (hire/fire, winnings) surface. */
  refreshTeams: () => Promise<void>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  /** True when the shell is backed by an authenticated (API) session. */
  authenticated: boolean;
  /** Signs the user out; a no-op when no logout handler is wired. */
  logout: () => void;
}

const noopLogout = () => {};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  children,
  store = new InMemoryTeamStore(),
  authenticated = false,
  onLogout = noopLogout,
  reloadVersion = 0,
}: {
  children: ReactNode;
  store?: TeamStore;
  authenticated?: boolean;
  onLogout?: () => void;
  /** Increment to force a re-list (e.g. after the legacy localStorage migration POSTs teams). */
  reloadVersion?: number;
}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    store.list().then((loaded) => {
      setTeams(loaded);
      setIsHydrated(true);
    });
  }, [store, reloadVersion]);

  const addTeam = useCallback(
    async (values: CreateTeamValues) => {
      const team: Team = {
        id: createId(),
        name: values.name,
        raceId: values.raceId,
        roster: values.roster,
        coaching: values.coaching,
        leagueId: values.leagueId ?? null,
        treasury: 0,
        // The API derives the real base from the league's ruleset (RAU-56);
        // the local optimistic value is only a placeholder until the save
        // response replaces it.
        startingTreasury: 1_000_000,
      };
      const saved = await store.save(team);
      setTeams((prev) => [...prev, saved]);
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

  const refreshTeams = useCallback(async () => {
    const loaded = await store.list();
    setTeams(loaded);
  }, [store]);

  const value = useMemo(
    () => ({
      teams,
      isHydrated,
      addTeam,
      removeTeam,
      refreshTeams,
      searchQuery,
      setSearchQuery,
      authenticated,
      logout: onLogout,
    }),
    [teams, isHydrated, addTeam, removeTeam, refreshTeams, searchQuery, authenticated, onLogout],
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
