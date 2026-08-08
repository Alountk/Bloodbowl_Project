"use client";

import { useEffect } from "react";
import { runTeamMigration, LEGACY_TEAMS_KEY } from "./migrateLocalTeams";
import type { Team } from "@/features/teams/types";

interface UseTeamMigrationOptions {
  /** Called once after a successful migration that posted at least one team. */
  onMigrated?: () => void;
}

/**
 * Client hook that runs the one-time legacy `bb_teams_v1` → account migration
 * the first time the session becomes authenticated for this browser.
 *
 * It is idempotent (the pure `runTeamMigration` is flag-gated and the hook
 * re-arms only when the flag is absent) and non-blocking: any failure is logged
 * and swallowed so a failed migration never blocks login. The flag is left unset
 * on failure so a later login retries.
 */
export function useTeamMigration(
  authenticated: boolean,
  { onMigrated }: UseTeamMigrationOptions = {},
) {
  useEffect(() => {
    if (!authenticated) return;

    let cancelled = false;
    (async () => {
      try {
        const result = await runTeamMigration({
          storage: window.localStorage,
          postTeam: async (team: Team) => {
            const res = await fetch("/api/teams", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(team),
            });
            if (!res.ok) throw new Error(`Failed to save team (${res.status})`);
            return res.json();
          },
        });
        // Non-blocking "surface": a partial migration failure is logged and the
        // flag is left unset so the next login retries. It never interrupts login.
        if (result.failed && !cancelled) {
          console.warn(
            `[migration] localStorage ${LEGACY_TEAMS_KEY} migration partially failed; will retry on next login.`,
          );
        } else if (result.migrated > 0 && !cancelled) {
          // Newly migrated teams exist in the DB but the already-hydrated team
          // list does not show them; signal the shell to re-hydrate.
          onMigrated?.();
        }
      } catch (error) {
        // Unexpected fatal path: still non-blocking, retained data, retry later.
        if (!cancelled) {
          console.warn(
            `[migration] localStorage ${LEGACY_TEAMS_KEY} migration failed; will retry on next login.`,
            error,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // `authenticated` is the only dependency; runTeamMigration is module-stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onMigrated is a stable prop callback.
  }, [authenticated]);
}
