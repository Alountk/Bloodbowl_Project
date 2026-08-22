"use client";

import { createContext, useContext } from "react";

/**
 * Bridges the legacy-team migration reload signal from the stable, layout-level
 * `SessionAppProvider` (which owns the one-shot `useTeamMigration` so its async
 * run survives the post-login `router.refresh` that remounts the home page) to
 * the self-shelled dashboard, whose AppProvider must re-hydrate once the
 * migration has POSTed the legacy teams.
 */
export const MigrationReloadContext = createContext(0);

export function useMigrationReload(): number {
  return useContext(MigrationReloadContext);
}
